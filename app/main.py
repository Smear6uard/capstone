from __future__ import annotations

import json
import os
import re
from typing import Any, Literal, TypeVar

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator

load_dotenv()

TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
TOGETHER_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"
ResponseModelT = TypeVar("ResponseModelT", bound=BaseModel)


class GenerateQuestionRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=200)
    difficulty: Literal["easy", "medium", "hard"]

    @field_validator("domain")
    @classmethod
    def validate_domain(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("domain must not be empty")
        return cleaned


class GenerateQuestionResponse(BaseModel):
    background_info: str = Field(
        description="A short paragraph of context to show the student."
    )
    question: str = Field(description="A single essay question.")
    grading_rubric: list[str] = Field(
        min_length=1,
        description="A list of criteria the student's answer should satisfy.",
    )


class GradeAnswerRequest(BaseModel):
    question: str = Field(min_length=1, max_length=5000)
    grading_rubric: list[str] = Field(
        min_length=1,
        description="Ordered rubric criteria used to grade the essay.",
    )
    background_info: str = Field(min_length=1, max_length=10000)
    student_answer: str = Field(min_length=1, max_length=25000)
    time_spent_seconds: float = Field(ge=0, le=86400)

    @field_validator("question", "background_info", "student_answer")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field must not be empty")
        return cleaned

    @field_validator("grading_rubric")
    @classmethod
    def validate_grading_rubric(cls, value: list[str]) -> list[str]:
        cleaned_criteria: list[str] = []
        for criterion in value:
            cleaned = criterion.strip()
            if not cleaned:
                raise ValueError("grading_rubric must not contain empty criteria")
            cleaned_criteria.append(cleaned)
        return cleaned_criteria


class CriterionScore(BaseModel):
    criterion: str = Field(min_length=1, max_length=500)
    score: int = Field(ge=0, le=100)
    feedback: str = Field(min_length=1)


class GradeAnswerResponse(BaseModel):
    criterion_scores: list[CriterionScore] = Field(min_length=1)
    overall_score: int = Field(ge=0, le=100)
    grading_explanation: str = Field(min_length=1)


class HealthCheckResponse(BaseModel):
    status: str


app = FastAPI(title="Capstone Question Generator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/", response_model=HealthCheckResponse)
@app.get("/health", response_model=HealthCheckResponse)
async def health_check() -> HealthCheckResponse:
    return HealthCheckResponse(status="ok")


def get_together_api_key() -> str:
    api_key = os.getenv("TOGETHER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="TOGETHER_API_KEY is not set. Add it to your .env file.",
        )
    return api_key


def build_prompt_schema(model: type[BaseModel]) -> str:
    return json.dumps(model.model_json_schema(), indent=2)


# Keywords we strip when sending a schema to Together. Together's grammar
# compiler is very slow (60-90s) when the schema contains constraint
# keywords, and it doesn't support $ref/$defs well. Pydantic validates the
# response on the way back, so we don't need Together to enforce these.
_SCHEMA_KEYWORDS_TO_STRIP = frozenset(
    {
        "$defs",
        "title",
        "description",
        "default",
        "minLength",
        "maxLength",
        "minimum",
        "maximum",
        "exclusiveMinimum",
        "exclusiveMaximum",
        "minItems",
        "maxItems",
        "pattern",
        "format",
    }
)


def simplify_schema_for_together(schema: dict[str, Any]) -> dict[str, Any]:
    """Flatten a Pydantic-generated JSON schema into a Together-friendly form.

    Inlines $ref/$defs and drops constraint keywords so Together's grammar
    compilation stays fast. Without this, a nested response model with
    constraints can push a single call past 90 seconds.
    """
    defs = schema.get("$defs", {})

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                ref = node["$ref"]
                name = ref.rsplit("/", 1)[-1]
                target = defs.get(name)
                if target is None:
                    return {}
                return walk(target)
            return {
                key: walk(value)
                for key, value in node.items()
                if key not in _SCHEMA_KEYWORDS_TO_STRIP
            }
        if isinstance(node, list):
            return [walk(item) for item in node]
        return node

    return walk(schema)


def parse_llm_content(raw_content: str) -> dict[str, Any]:
    content = raw_content.strip()
    if content.startswith("```"):
        content = content.strip("`")
        if content.startswith("json"):
            content = content[4:]
        content = content.strip()

    try:
        parsed: dict[str, Any] = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(
            status_code=502,
            detail="Together API returned content that was not valid JSON.",
        ) from exc

    return parsed


def normalize_criterion_name(value: str) -> str:
    normalized = value.strip().lower()
    # Drop common list prefixes like "1. ", "2) ", or "criterion 1: ".
    normalized = re.sub(r"^(?:criterion\s*\d+\s*[:\-.)]\s*|\d+\s*[:\-.)]\s*)", "", normalized)
    normalized = re.sub(r"\s+", " ", normalized)
    return normalized


def extract_together_content(data: dict[str, Any]) -> str:
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Together API returned an unexpected response shape.",
        ) from exc


async def call_together_json(
    *,
    messages: list[dict[str, str]],
    response_model: type[ResponseModelT],
    temperature: float = 0.7,
) -> ResponseModelT:
    api_key = get_together_api_key()
    payload = {
        "model": TOGETHER_MODEL,
        "messages": messages,
        "response_format": {
            "type": "json_schema",
            "schema": simplify_schema_for_together(
                response_model.model_json_schema()
            ),
        },
        "temperature": temperature,
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(120.0, connect=10.0)
    ) as client:
        for attempt in range(2):
            try:
                response = await client.post(
                    TOGETHER_API_URL,
                    headers=headers,
                    json=payload,
                )
                response.raise_for_status()
                break
            except httpx.TimeoutException as exc:
                if attempt == 1:
                    raise HTTPException(
                        status_code=504,
                        detail=(
                            "Together API request timed out. "
                            "Try submitting again."
                        ),
                    ) from exc
            except httpx.HTTPStatusError as exc:
                raise HTTPException(
                    status_code=502,
                    detail=f"Together API returned an error: {exc.response.text}",
                ) from exc
            except httpx.HTTPError as exc:
                if attempt == 1:
                    raise HTTPException(
                        status_code=502,
                        detail=(
                            "Failed to reach Together API "
                            f"({exc.__class__.__name__})."
                        ),
                    ) from exc

    try:
        data = response.json()
        content = extract_together_content(data)
    except ValueError as exc:
        raise HTTPException(
            status_code=502,
            detail="Together API returned invalid JSON at the HTTP layer.",
        ) from exc

    parsed = parse_llm_content(content)

    try:
        return response_model.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Together API returned JSON that did not match the expected schema.",
        ) from exc


@app.post("/api/generate-question", response_model=GenerateQuestionResponse)
async def generate_question(
    request: GenerateQuestionRequest,
) -> GenerateQuestionResponse:
    prompt_schema = build_prompt_schema(GenerateQuestionResponse)

    return await call_together_json(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert educational assessment designer. "
                    "Generate exactly one essay question based on the user's requested "
                    "domain and difficulty. Respond only with valid JSON that matches "
                    f"this schema: {prompt_schema}. "
                    "The background_info must be a short paragraph. "
                    "The question must be a single essay prompt. "
                    "The grading_rubric must be a list of concise criteria. "
                    "Do not include markdown, code fences, or any extra text."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Domain: {request.domain}\n"
                    f"Difficulty: {request.difficulty}"
                ),
            },
        ],
        response_model=GenerateQuestionResponse,
        temperature=0.7,
    )


@app.post("/api/grade-answer", response_model=GradeAnswerResponse)
async def grade_answer(request: GradeAnswerRequest) -> GradeAnswerResponse:
    prompt_schema = build_prompt_schema(GradeAnswerResponse)
    rubric_lines = "\n".join(
        f"{index}. {criterion}"
        for index, criterion in enumerate(request.grading_rubric, start=1)
    )

    graded_response = await call_together_json(
        messages=[
            {
                "role": "system",
                "content": (
                    "You are an expert essay grader. "
                    "Evaluate the student's answer against every rubric criterion. "
                    "Respond only with valid JSON that matches this schema: "
                    f"{prompt_schema}. "
                    "The criterion_scores array must contain one item for each rubric "
                    "criterion in the same order provided by the user, and each "
                    "criterion field must exactly match the rubric text. "
                    "Each score must be an integer from 0 to 100. "
                    "The overall_score must be an integer from 0 to 100 reflecting "
                    "the full submission. "
                    "The grading_explanation must be detailed and explain the main "
                    "strengths, weaknesses, and how the rubric informed the grade. "
                    "Use the student's time_spent_seconds as context, but do not "
                    "reward or penalize time on its own unless it is clearly relevant "
                    "to the quality of the answer. "
                    "Do not include markdown, code fences, or any extra text."
                ),
            },
            {
                "role": "user",
                "content": (
                    f"Question:\n{request.question}\n\n"
                    f"Grading rubric:\n{rubric_lines}\n\n"
                    f"Background info:\n{request.background_info}\n\n"
                    f"Student answer:\n{request.student_answer}\n\n"
                    f"Time spent (seconds): {request.time_spent_seconds}"
                ),
            },
        ],
        response_model=GradeAnswerResponse,
        temperature=0.2,
    )

    if len(graded_response.criterion_scores) != len(request.grading_rubric):
        raise HTTPException(
            status_code=502,
            detail=(
                "Together API returned a criterion_scores array with the wrong "
                "number of items."
            ),
        )

    returned_by_name: dict[str, list[CriterionScore]] = {}
    for criterion_score in graded_response.criterion_scores:
        key = normalize_criterion_name(criterion_score.criterion)
        returned_by_name.setdefault(key, []).append(criterion_score)

    aligned_scores: list[CriterionScore] = []
    unused_scores: list[CriterionScore] = list(graded_response.criterion_scores)

    for criterion in request.grading_rubric:
        key = normalize_criterion_name(criterion)
        matches = returned_by_name.get(key, [])

        # If the model paraphrases criterion names, preserve usability by
        # falling back to remaining scores in order.
        if matches:
            matched_score = matches.pop(0)
            unused_scores.remove(matched_score)
        else:
            matched_score = unused_scores.pop(0)
        aligned_scores.append(
            CriterionScore(
                criterion=criterion,
                score=matched_score.score,
                feedback=matched_score.feedback,
            )
        )

    return GradeAnswerResponse(
        criterion_scores=aligned_scores,
        overall_score=graded_response.overall_score,
        grading_explanation=graded_response.grading_explanation,
    )
