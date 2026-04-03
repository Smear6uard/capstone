from __future__ import annotations

import json
import os
from typing import Any, Literal

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator

load_dotenv()

TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
TOGETHER_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"


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


def build_prompt_schema() -> str:
    return json.dumps(GenerateQuestionResponse.model_json_schema(), indent=2)


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


@app.post("/api/generate-question", response_model=GenerateQuestionResponse)
async def generate_question(
    request: GenerateQuestionRequest,
) -> GenerateQuestionResponse:
    api_key = get_together_api_key()
    prompt_schema = build_prompt_schema()

    payload = {
        "model": TOGETHER_MODEL,
        "messages": [
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
        "response_format": {
            "type": "json_schema",
            "json_schema": {
                "name": "generated_question",
                "schema": GenerateQuestionResponse.model_json_schema(),
            },
        },
        "temperature": 0.7,
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(
        timeout=httpx.Timeout(45.0, connect=10.0)
    ) as client:
        try:
            response = await client.post(
                TOGETHER_API_URL,
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Together API returned an error: {exc.response.text}",
            ) from exc
        except httpx.HTTPError as exc:
            raise HTTPException(
                status_code=502,
                detail="Failed to reach Together API.",
            ) from exc

    try:
        data = response.json()
        content = data["choices"][0]["message"]["content"]
    except (ValueError, KeyError, IndexError, TypeError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Together API returned an unexpected response shape.",
        ) from exc

    parsed = parse_llm_content(content)

    try:
        return GenerateQuestionResponse.model_validate(parsed)
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Together API returned JSON that did not match the expected schema.",
        ) from exc
