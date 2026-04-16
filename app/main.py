from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Literal, Optional, TypeVar

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator

load_dotenv()

TOGETHER_API_URL = "https://api.together.xyz/v1/chat/completions"
TOGETHER_MODEL = "meta-llama/Llama-3.3-70B-Instruct-Turbo"
ResponseModelT = TypeVar("ResponseModelT", bound=BaseModel)

Difficulty = Literal["easy", "medium", "hard"]


# ── Difficulty guidance (shared by generation + grading) ─────────────────────

DIFFICULTY_QUESTION_STYLE: dict[str, str] = {
    "easy": (
        "Ask a broad, conceptual essay question that invites the student to "
        "explain the main ideas of the topic in their own words. The question "
        "should test foundational understanding, not memorized detail."
    ),
    "medium": (
        "Ask an analytical or comparative essay question that requires the "
        "student to go beyond a summary. They should analyze a specific "
        "aspect of the topic, compare two ideas, or trace cause and effect "
        "using concrete evidence."
    ),
    "hard": (
        "Ask a demanding critical-thinking essay question that forces the "
        "student to synthesize at least two distinct concepts, weigh "
        "competing interpretations, and defend an argued position with "
        "evidence. The prompt should have no single simple answer."
    ),
}

DIFFICULTY_GRADING_STRICTNESS: dict[str, str] = {
    "easy": (
        "Grade leniently for an introductory student. Reward genuine "
        "conceptual understanding even if details are thin. Penalize only "
        "clear misconceptions or empty answers."
    ),
    "medium": (
        "Grade to a standard undergraduate bar. Reward accurate analysis "
        "with concrete evidence; penalize vague generalities and "
        "unsupported claims."
    ),
    "hard": (
        "Grade strictly at an advanced level. Require synthesis across "
        "multiple concepts, specific evidence, engagement with "
        "counterarguments, and a defended thesis. Award high scores only "
        "when the answer truly earns them."
    ),
}


# ── Request / response models ────────────────────────────────────────────────


class HealthCheckResponse(BaseModel):
    status: str


class ConfigureExamRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=200)
    topics: list[str] = Field(default_factory=list, max_length=20)
    num_questions: int = Field(ge=1, le=10)
    difficulty: Difficulty
    special_instructions: str = Field(default="", max_length=2000)

    @field_validator("domain")
    @classmethod
    def _clean_domain(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("domain must not be empty")
        return cleaned

    @field_validator("topics")
    @classmethod
    def _clean_topics(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for topic in value:
            stripped = topic.strip()
            if stripped:
                cleaned.append(stripped)
        return cleaned


class ConfigureExamResponse(BaseModel):
    config_id: str
    domain: str
    topics: list[str]
    num_questions: int
    difficulty: Difficulty
    special_instructions: str
    created_at: str


class StartExamRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=200)
    num_questions: int = Field(ge=1, le=10)
    difficulty: Difficulty
    topics: list[str] = Field(default_factory=list, max_length=20)
    student_name: str = Field(default="Anonymous Student", max_length=120)
    config_id: Optional[str] = None

    @field_validator("domain", "student_name")
    @classmethod
    def _clean_text(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("field must not be empty")
        return cleaned

    @field_validator("topics")
    @classmethod
    def _clean_topics(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for topic in value:
            stripped = topic.strip()
            if stripped:
                cleaned.append(stripped)
        return cleaned


class StartExamResponse(BaseModel):
    session_id: str
    student_name: str
    domain: str
    difficulty: Difficulty
    num_questions: int


class GenerateQuestionRequest(BaseModel):
    session_id: str = Field(min_length=1)


class GenerateQuestionResponse(BaseModel):
    background_info: str = Field(
        description="A short paragraph of context to show the student."
    )
    question: str = Field(description="A single essay question.")
    grading_rubric: list[str] = Field(
        min_length=1,
        description="A list of criteria the student's answer should satisfy.",
    )
    topic: str = Field(
        description="A short label for the subtopic this question covers."
    )
    question_index: int = Field(ge=0)
    total_questions: int = Field(ge=1)


class LLMGeneratedQuestion(BaseModel):
    background_info: str
    question: str
    grading_rubric: list[str] = Field(min_length=1)
    topic: str


class GradeAnswerRequest(BaseModel):
    session_id: str = Field(min_length=1)
    student_answer: str = Field(min_length=1, max_length=25000)
    time_spent_seconds: float = Field(ge=0, le=86400)

    @field_validator("student_answer")
    @classmethod
    def _clean_student_answer(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("student_answer must not be empty")
        return cleaned


class CriterionScore(BaseModel):
    criterion: str = Field(min_length=1, max_length=500)
    score: int = Field(ge=0, le=100)
    feedback: str = Field(min_length=1)


class GradeAnswerResponse(BaseModel):
    criterion_scores: list[CriterionScore] = Field(min_length=1)
    overall_score: int = Field(ge=0, le=100)
    grading_explanation: str = Field(min_length=1)
    question_index: int = Field(ge=0)


class FinishExamRequest(BaseModel):
    session_id: str = Field(min_length=1)


class QuestionReport(BaseModel):
    question_index: int
    topic: str
    question: str
    background_info: str
    grading_rubric: list[str]
    student_answer: str
    criterion_scores: list[CriterionScore]
    overall_score: int
    grading_explanation: str
    time_spent_seconds: float


class FinishExamResponse(BaseModel):
    session_id: str
    student_name: str
    domain: str
    difficulty: Difficulty
    num_questions: int
    questions: list[QuestionReport]
    composite_score: int
    composite_feedback: str
    total_time_seconds: float
    completed_at: str


class LLMComposite(BaseModel):
    composite_score: int = Field(ge=0, le=100)
    composite_feedback: str = Field(min_length=1)


class ExamResultsResponse(BaseModel):
    exams: list[FinishExamResponse]


# ── App setup ────────────────────────────────────────────────────────────────

app = FastAPI(title="Capstone Question Generator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# In-memory stores. Swap these for a DB when persistence is needed.
_exam_configs: dict[str, dict[str, Any]] = {}
_exam_sessions: dict[str, dict[str, Any]] = {}
_completed_exams: list[dict[str, Any]] = []


@app.get("/", response_model=HealthCheckResponse)
@app.get("/health", response_model=HealthCheckResponse)
async def health_check() -> HealthCheckResponse:
    return HealthCheckResponse(status="ok")


# ── Together API helpers ─────────────────────────────────────────────────────


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
    """Inline $refs and drop constraint keywords so Together's grammar
    compilation stays fast. Pydantic validates on the way back."""
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
    normalized = re.sub(
        r"^(?:criterion\s*\d+\s*[:\-.)]\s*|\d+\s*[:\-.)]\s*)", "", normalized
    )
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
            detail=(
                "Together API returned JSON that did not match the expected "
                f"schema: {exc.errors()[:2]}"
            ),
        ) from exc


# ── Session helpers ──────────────────────────────────────────────────────────


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _require_session(session_id: str) -> dict[str, Any]:
    session = _exam_sessions.get(session_id)
    if session is None:
        raise HTTPException(
            status_code=404,
            detail=f"Exam session {session_id!r} not found.",
        )
    return session


# ── Teacher configuration endpoints ──────────────────────────────────────────


@app.post("/api/configure-exam", response_model=ConfigureExamResponse)
async def configure_exam(
    request: ConfigureExamRequest,
) -> ConfigureExamResponse:
    config_id = uuid.uuid4().hex
    record = {
        "config_id": config_id,
        "domain": request.domain,
        "topics": request.topics,
        "num_questions": request.num_questions,
        "difficulty": request.difficulty,
        "special_instructions": request.special_instructions.strip(),
        "created_at": _now_iso(),
    }
    _exam_configs[config_id] = record
    return ConfigureExamResponse(**record)


@app.get("/api/exam-configs", response_model=list[ConfigureExamResponse])
async def list_exam_configs() -> list[ConfigureExamResponse]:
    return [
        ConfigureExamResponse(**config)
        for config in sorted(
            _exam_configs.values(),
            key=lambda c: c["created_at"],
            reverse=True,
        )
    ]


@app.get("/api/exam-results", response_model=ExamResultsResponse)
async def exam_results() -> ExamResultsResponse:
    return ExamResultsResponse(
        exams=[FinishExamResponse(**exam) for exam in _completed_exams]
    )


# ── Student exam flow ────────────────────────────────────────────────────────


@app.post("/api/start-exam", response_model=StartExamResponse)
async def start_exam(request: StartExamRequest) -> StartExamResponse:
    special_instructions = ""
    domain = request.domain
    topics = list(request.topics)
    num_questions = request.num_questions
    difficulty: Difficulty = request.difficulty

    if request.config_id is not None:
        config = _exam_configs.get(request.config_id)
        if config is None:
            raise HTTPException(
                status_code=404,
                detail=f"Exam config {request.config_id!r} not found.",
            )
        special_instructions = config["special_instructions"]
        if not topics:
            topics = list(config["topics"])

    session_id = uuid.uuid4().hex
    _exam_sessions[session_id] = {
        "session_id": session_id,
        "student_name": request.student_name,
        "domain": domain,
        "difficulty": difficulty,
        "num_questions": num_questions,
        "topics": topics,
        "config_id": request.config_id,
        "special_instructions": special_instructions,
        "questions": [],  # list[dict]
        "pending_question": None,  # dict | None (generated but not yet answered)
        "status": "in_progress",
        "created_at": _now_iso(),
    }

    return StartExamResponse(
        session_id=session_id,
        student_name=request.student_name,
        domain=domain,
        difficulty=difficulty,
        num_questions=num_questions,
    )


def _covered_topics(session: dict[str, Any]) -> list[str]:
    covered: list[str] = []
    for q in session["questions"]:
        topic = q.get("topic")
        if topic:
            covered.append(topic)
    return covered


@app.post("/api/generate-question", response_model=GenerateQuestionResponse)
async def generate_question(
    request: GenerateQuestionRequest,
) -> GenerateQuestionResponse:
    session = _require_session(request.session_id)

    if session["status"] == "completed":
        raise HTTPException(
            status_code=400,
            detail="Exam already completed.",
        )

    question_index = len(session["questions"])
    total_questions = session["num_questions"]

    if question_index >= total_questions:
        raise HTTPException(
            status_code=400,
            detail="All questions for this exam have already been generated.",
        )

    if session["pending_question"] is not None:
        pending = session["pending_question"]
        return GenerateQuestionResponse(
            background_info=pending["background_info"],
            question=pending["question"],
            grading_rubric=pending["grading_rubric"],
            topic=pending["topic"],
            question_index=question_index,
            total_questions=total_questions,
        )

    covered = _covered_topics(session)
    focus_topic: str | None = None
    if session["topics"]:
        focus_topic = session["topics"][question_index % len(session["topics"])]

    prompt_schema = build_prompt_schema(LLMGeneratedQuestion)

    covered_block = (
        "None yet." if not covered else "\n".join(f"- {t}" for t in covered)
    )
    focus_block = (
        f"Focus the question specifically on this subtopic: {focus_topic}"
        if focus_topic
        else (
            "Pick a subtopic that is clearly distinct from any already-covered "
            "subtopics listed above."
        )
    )
    special_block = (
        f"Special instructions from the teacher: {session['special_instructions']}"
        if session["special_instructions"]
        else ""
    )

    difficulty = session["difficulty"]
    style_guidance = DIFFICULTY_QUESTION_STYLE[difficulty]

    system_prompt = (
        "You are an expert educational assessment designer. Generate exactly "
        "one essay question tailored to the given domain, difficulty, and "
        "subtopic constraints. Respond only with valid JSON matching this "
        f"schema: {prompt_schema}. "
        "The background_info must be a short paragraph of context. "
        "The question must be a single essay prompt. "
        "The grading_rubric must be 3-5 concise criteria. "
        "The topic must be a short 2-6 word label naming the subtopic. "
        f"Difficulty guidance: {style_guidance} "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {difficulty}\n"
        f"Question number: {question_index + 1} of {total_questions}\n"
        f"Already-covered subtopics (do NOT repeat):\n{covered_block}\n"
        f"{focus_block}\n"
        + (f"{special_block}\n" if special_block else "")
    )

    generated = await call_together_json(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_model=LLMGeneratedQuestion,
        temperature=0.7,
    )

    pending = {
        "topic": generated.topic.strip() or (focus_topic or f"Question {question_index + 1}"),
        "background_info": generated.background_info.strip(),
        "question": generated.question.strip(),
        "grading_rubric": [r.strip() for r in generated.grading_rubric if r.strip()],
    }
    session["pending_question"] = pending

    return GenerateQuestionResponse(
        background_info=pending["background_info"],
        question=pending["question"],
        grading_rubric=pending["grading_rubric"],
        topic=pending["topic"],
        question_index=question_index,
        total_questions=total_questions,
    )


def _align_criterion_scores(
    rubric: list[str],
    returned: list[CriterionScore],
) -> list[CriterionScore]:
    """Re-align LLM-returned criterion scores to the rubric order."""
    by_name: dict[str, list[CriterionScore]] = {}
    for cs in returned:
        key = normalize_criterion_name(cs.criterion)
        by_name.setdefault(key, []).append(cs)

    aligned: list[CriterionScore] = []
    unused = list(returned)

    for criterion in rubric:
        key = normalize_criterion_name(criterion)
        matches = by_name.get(key, [])
        if matches:
            matched = matches.pop(0)
            unused.remove(matched)
        else:
            matched = unused.pop(0)
        aligned.append(
            CriterionScore(
                criterion=criterion,
                score=matched.score,
                feedback=matched.feedback,
            )
        )
    return aligned


@app.post("/api/grade-answer", response_model=GradeAnswerResponse)
async def grade_answer(request: GradeAnswerRequest) -> GradeAnswerResponse:
    session = _require_session(request.session_id)

    if session["status"] == "completed":
        raise HTTPException(
            status_code=400,
            detail="Exam already completed.",
        )

    pending = session["pending_question"]
    if pending is None:
        raise HTTPException(
            status_code=400,
            detail="No pending question to grade. Call /api/generate-question first.",
        )

    question_index = len(session["questions"])
    difficulty = session["difficulty"]
    strictness = DIFFICULTY_GRADING_STRICTNESS[difficulty]
    rubric: list[str] = pending["grading_rubric"]

    prompt_schema = build_prompt_schema(GradeAnswerResponse)
    rubric_lines = "\n".join(
        f"{index}. {criterion}"
        for index, criterion in enumerate(rubric, start=1)
    )

    system_prompt = (
        "You are an expert essay grader. Evaluate the student's answer "
        "against every rubric criterion. Respond only with valid JSON "
        f"matching this schema: {prompt_schema}. "
        "The criterion_scores array must contain one item for each rubric "
        "criterion, in the same order provided. Each criterion field must "
        "exactly match the rubric text. "
        "Each score must be an integer from 0 to 100. The overall_score must "
        "be an integer from 0 to 100 reflecting the full submission. "
        "IMPORTANT: every per-criterion feedback string must explain "
        "specifically what the student would need to do to improve that "
        "score. The grading_explanation must summarize strengths, "
        "weaknesses, and concrete improvements that would raise the overall "
        "grade. "
        "Use time_spent_seconds as context, but do not reward or penalize "
        "time on its own unless clearly relevant to answer quality. "
        f"Difficulty calibration: {strictness} "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Question:\n{pending['question']}\n\n"
        f"Grading rubric:\n{rubric_lines}\n\n"
        f"Background info:\n{pending['background_info']}\n\n"
        f"Student answer:\n{request.student_answer}\n\n"
        f"Time spent (seconds): {request.time_spent_seconds}"
    )

    graded = await call_together_json(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_model=GradeAnswerResponse,
        temperature=0.2,
    )

    if len(graded.criterion_scores) != len(rubric):
        raise HTTPException(
            status_code=502,
            detail=(
                "Together API returned a criterion_scores array with the "
                "wrong number of items."
            ),
        )

    aligned_scores = _align_criterion_scores(rubric, graded.criterion_scores)

    record: dict[str, Any] = {
        "question_index": question_index,
        "topic": pending["topic"],
        "question": pending["question"],
        "background_info": pending["background_info"],
        "grading_rubric": rubric,
        "student_answer": request.student_answer,
        "time_spent_seconds": request.time_spent_seconds,
        "criterion_scores": [cs.model_dump() for cs in aligned_scores],
        "overall_score": graded.overall_score,
        "grading_explanation": graded.grading_explanation,
    }
    session["questions"].append(record)
    session["pending_question"] = None

    return GradeAnswerResponse(
        criterion_scores=aligned_scores,
        overall_score=graded.overall_score,
        grading_explanation=graded.grading_explanation,
        question_index=question_index,
    )


@app.post("/api/finish-exam", response_model=FinishExamResponse)
async def finish_exam(request: FinishExamRequest) -> FinishExamResponse:
    session = _require_session(request.session_id)

    if not session["questions"]:
        raise HTTPException(
            status_code=400,
            detail="Cannot finish an exam with no graded answers.",
        )

    if session["status"] == "completed":
        raise HTTPException(
            status_code=400,
            detail="Exam already completed.",
        )

    difficulty: Difficulty = session["difficulty"]
    strictness = DIFFICULTY_GRADING_STRICTNESS[difficulty]

    # Build the summary the LLM reads. Keep it compact: rubric-level scores,
    # overall scores per question, and the student's answer.
    summary_lines: list[str] = []
    for q in session["questions"]:
        summary_lines.append(f"Question {q['question_index'] + 1}: {q['question']}")
        summary_lines.append(f"Subtopic: {q['topic']}")
        summary_lines.append(f"Student answer: {q['student_answer']}")
        summary_lines.append(f"Overall score: {q['overall_score']}/100")
        summary_lines.append("Per-criterion scores:")
        for cs in q["criterion_scores"]:
            summary_lines.append(
                f"  - {cs['criterion']}: {cs['score']}/100 — {cs['feedback']}"
            )
        summary_lines.append(
            f"Time spent: {q['time_spent_seconds']:.0f}s"
        )
        summary_lines.append("")

    prompt_schema = build_prompt_schema(LLMComposite)

    system_prompt = (
        "You are an expert examiner producing a composite grade and "
        "feedback for a student's full multi-question essay exam. Respond "
        "only with valid JSON matching this schema: "
        f"{prompt_schema}. "
        "The composite_score must be an integer from 0 to 100. It should "
        "reflect the student's overall mastery across the entire exam, not "
        "a simple average: weight consistency, depth, and coverage of the "
        "assigned subtopics. "
        "The composite_feedback must explain the overall strengths, the "
        "main weaknesses, and the most impactful specific things the "
        "student should do to improve. "
        f"Difficulty calibration: {strictness} "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {difficulty}\n"
        f"Student: {session['student_name']}\n"
        f"Total questions: {len(session['questions'])}\n\n"
        f"Per-question detail:\n\n" + "\n".join(summary_lines)
    )

    composite = await call_together_json(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_model=LLMComposite,
        temperature=0.2,
    )

    question_reports = [
        QuestionReport(
            question_index=q["question_index"],
            topic=q["topic"],
            question=q["question"],
            background_info=q["background_info"],
            grading_rubric=q["grading_rubric"],
            student_answer=q["student_answer"],
            criterion_scores=[CriterionScore(**cs) for cs in q["criterion_scores"]],
            overall_score=q["overall_score"],
            grading_explanation=q["grading_explanation"],
            time_spent_seconds=q["time_spent_seconds"],
        )
        for q in session["questions"]
    ]

    total_time = sum(q["time_spent_seconds"] for q in session["questions"])
    completed_at = _now_iso()

    result = FinishExamResponse(
        session_id=session["session_id"],
        student_name=session["student_name"],
        domain=session["domain"],
        difficulty=difficulty,
        num_questions=session["num_questions"],
        questions=question_reports,
        composite_score=composite.composite_score,
        composite_feedback=composite.composite_feedback,
        total_time_seconds=total_time,
        completed_at=completed_at,
    )

    session["status"] = "completed"
    _completed_exams.append(result.model_dump())

    return result
