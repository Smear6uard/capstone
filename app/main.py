from __future__ import annotations

import json
import os
import re
import uuid
from collections import Counter, defaultdict
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
GradeLevel = Literal["Middle School", "High School", "Undergraduate", "Graduate"]
GradingPersonality = Literal["Strict", "Balanced", "Encouraging"]


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

GRADE_LEVEL_QUESTION_STYLE: dict[str, str] = {
    "Middle School": (
        "Use accessible vocabulary, familiar examples, and a short essay "
        "prompt that asks for clear explanation before analysis. Avoid "
        "specialized jargon unless it is defined in the prompt."
    ),
    "High School": (
        "Use age-appropriate academic vocabulary and ask for a structured "
        "paragraph or short essay with evidence. Expect reasoning beyond "
        "recall, but do not require disciplinary methods or specialist "
        "sources."
    ),
    "Undergraduate": (
        "Use college-level vocabulary and ask for a developed analytical "
        "essay. Expect accurate concepts, evidence, and clear reasoning."
    ),
    "Graduate": (
        "Use advanced disciplinary vocabulary and ask for a sophisticated "
        "argument that can address assumptions, methods, evidence quality, "
        "and competing interpretations."
    ),
}

GRADE_LEVEL_GRADING_EXPECTATIONS: dict[str, str] = {
    "Middle School": (
        "Evaluate for accurate core understanding, organization, and use of "
        "simple supporting details. Do not penalize the student for lacking "
        "advanced vocabulary or formal citation practices."
    ),
    "High School": (
        "Evaluate for a clear claim, relevant evidence, and explanation. Do "
        "not require primary-source citation, specialist terminology, or "
        "graduate-level nuance unless the question explicitly asks for it."
    ),
    "Undergraduate": (
        "Evaluate for conceptual accuracy, analysis, evidence, and a coherent "
        "argument. Expect some nuance, but keep standards aligned with a "
        "college course rather than expert research."
    ),
    "Graduate": (
        "Evaluate for advanced command of the field, methodological awareness, "
        "specific evidence, synthesis, and engagement with competing views."
    ),
}

GRADING_PERSONALITY_GUIDANCE: dict[str, str] = {
    "Strict": (
        "Use high standards and detailed critique. Scores should skew lower "
        "when the answer is vague, unsupported, incomplete, or imprecise."
    ),
    "Balanced": (
        "Use fair, thorough grading. Weigh strengths and weaknesses evenly "
        "and keep scores calibrated to the rubric."
    ),
    "Encouraging": (
        "Use a constructive tone that foregrounds what the student did well. "
        "Be gentler on minor mistakes and allow scores to skew slightly "
        "higher when the core reasoning is sound."
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
    grade_level: GradeLevel = "Undergraduate"
    grading_personality: GradingPersonality = "Balanced"
    teacher_name: str = Field(default="", max_length=120)
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

    @field_validator("teacher_name")
    @classmethod
    def _clean_teacher_name(cls, value: str) -> str:
        return value.strip()


class ConfigureExamResponse(BaseModel):
    config_id: str
    domain: str
    topics: list[str]
    num_questions: int
    difficulty: Difficulty
    grade_level: GradeLevel
    grading_personality: GradingPersonality
    teacher_name: str
    special_instructions: str
    created_at: str


class StartExamRequest(BaseModel):
    domain: str = Field(min_length=1, max_length=200)
    num_questions: int = Field(ge=1, le=10)
    difficulty: Difficulty
    grade_level: GradeLevel = "Undergraduate"
    grading_personality: GradingPersonality = "Balanced"
    teacher_name: str = Field(default="", max_length=120)
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

    @field_validator("teacher_name")
    @classmethod
    def _clean_teacher_name(cls, value: str) -> str:
        return value.strip()


class StartExamResponse(BaseModel):
    session_id: str
    student_name: str
    domain: str
    difficulty: Difficulty
    grade_level: GradeLevel
    grading_personality: GradingPersonality
    teacher_name: str
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


class GradeDisputeRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question_index: int = Field(ge=0)
    dispute_argument: str = Field(min_length=1, max_length=5000)

    @field_validator("dispute_argument")
    @classmethod
    def _clean_dispute_argument(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("dispute_argument must not be empty")
        return cleaned


class LLMGradeDisputeDecision(BaseModel):
    dispute_accepted: bool
    revised_score: int = Field(ge=0, le=100)
    reviewer_explanation: str = Field(min_length=1)


class GradeDisputeResponse(BaseModel):
    dispute_accepted: bool
    original_score: int = Field(ge=0, le=100)
    revised_score: int = Field(ge=0, le=100)
    reviewer_explanation: str = Field(min_length=1)


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
    dispute_result: Optional[GradeDisputeResponse] = None


class FinishExamResponse(BaseModel):
    session_id: str
    student_name: str
    domain: str
    difficulty: Difficulty
    grade_level: GradeLevel
    grading_personality: GradingPersonality
    teacher_name: str
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


class ScoreDistributionBucket(BaseModel):
    label: str
    min_score: int
    max_score: int
    count: int


class PerQuestionAnalytics(BaseModel):
    question_index: int
    attempts: int
    average_score: float
    average_time_seconds: float
    topics: list[str]


class DisputedQuestionAnalytics(BaseModel):
    question_index: int
    topic: str
    question: str
    dispute_count: int
    accepted_disputes: int
    average_original_score: float


class AnalyticsSession(BaseModel):
    session_id: str
    student_name: str
    domain: str
    completed_at: str
    num_questions: int
    composite_score: int
    dispute_count: int


class ExamAnalyticsResponse(BaseModel):
    completed_sessions: int
    overall_average_score: float
    average_time_per_question: float
    score_distribution: list[ScoreDistributionBucket]
    per_question_average_scores: list[PerQuestionAnalytics]
    most_disputed_questions: list[DisputedQuestionAnalytics]
    sessions: list[AnalyticsSession]


class TutorSessionRequest(BaseModel):
    session_id: str = Field(min_length=1)
    question_index: int = Field(ge=0)
    message: str = Field(default="", max_length=5000)

    @field_validator("message")
    @classmethod
    def _clean_message(cls, value: str) -> str:
        return value.strip()


class TutorMessage(BaseModel):
    role: Literal["student", "tutor"]
    content: str = Field(min_length=1)
    created_at: str


class LLMTutorTurn(BaseModel):
    message: str = Field(min_length=1)


class TutorSessionResponse(BaseModel):
    session_id: str
    question_index: int
    messages: list[TutorMessage]


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


def _feedback_label(teacher_name: str) -> str:
    cleaned = teacher_name.strip()
    return f"{cleaned}'s feedback:" if cleaned else "Feedback:"


def _ensure_named_feedback(text: str, teacher_name: str) -> str:
    cleaned = text.strip()
    if not teacher_name.strip():
        return cleaned

    label = _feedback_label(teacher_name)
    if cleaned.lower().startswith(label.lower()):
        return cleaned
    return f"{label} {cleaned}"


def _find_completed_exam(session_id: str) -> dict[str, Any] | None:
    for exam in _completed_exams:
        if exam.get("session_id") == session_id:
            return exam
    return None


def _clamp_score(value: float) -> int:
    return max(0, min(100, round(value)))


def _effective_question_score(question: dict[str, Any]) -> int:
    dispute = question.get("dispute_result")
    if dispute and dispute.get("dispute_accepted"):
        return int(dispute["revised_score"])
    return int(question["overall_score"])


def _effective_composite_score(exam: dict[str, Any]) -> int:
    questions = exam.get("questions", [])
    if not questions:
        return int(exam.get("composite_score", 0))

    accepted_delta = 0
    has_accepted_dispute = False
    for question in questions:
        dispute = question.get("dispute_result")
        if dispute and dispute.get("dispute_accepted"):
            has_accepted_dispute = True
            accepted_delta += int(dispute["revised_score"]) - int(
                dispute["original_score"]
            )

    original = int(exam.get("composite_score", 0))
    if not has_accepted_dispute:
        return original
    return _clamp_score(original + accepted_delta / len(questions))


def _round_one(value: float) -> float:
    return round(value, 1)


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
        "grade_level": request.grade_level,
        "grading_personality": request.grading_personality,
        "teacher_name": request.teacher_name,
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


@app.get("/api/exam-analytics", response_model=ExamAnalyticsResponse)
async def exam_analytics() -> ExamAnalyticsResponse:
    composite_scores = [_effective_composite_score(exam) for exam in _completed_exams]
    total_questions = sum(len(exam.get("questions", [])) for exam in _completed_exams)
    total_time = sum(
        float(question["time_spent_seconds"])
        for exam in _completed_exams
        for question in exam.get("questions", [])
    )

    bucket_defs = [
        ("0-59", 0, 59),
        ("60-69", 60, 69),
        ("70-79", 70, 79),
        ("80-89", 80, 89),
        ("90-100", 90, 100),
    ]
    distribution = [
        ScoreDistributionBucket(
            label=label,
            min_score=min_score,
            max_score=max_score,
            count=sum(min_score <= score <= max_score for score in composite_scores),
        )
        for label, min_score, max_score in bucket_defs
    ]

    scores_by_index: dict[int, list[int]] = defaultdict(list)
    times_by_index: dict[int, list[float]] = defaultdict(list)
    topics_by_index: dict[int, Counter[str]] = defaultdict(Counter)
    disputed_by_question: dict[str, dict[str, Any]] = {}

    for exam in _completed_exams:
        for question in exam.get("questions", []):
            index = int(question["question_index"])
            scores_by_index[index].append(_effective_question_score(question))
            times_by_index[index].append(float(question["time_spent_seconds"]))
            topic = question.get("topic") or "Untitled topic"
            topics_by_index[index][topic] += 1

            dispute = question.get("dispute_result")
            if dispute is None:
                continue

            question_text = question.get("question", "")
            key = question_text.strip().lower()
            if key not in disputed_by_question:
                disputed_by_question[key] = {
                    "question_index": index,
                    "topic": topic,
                    "question": question_text,
                    "dispute_count": 0,
                    "accepted_disputes": 0,
                    "original_scores": [],
                }
            item = disputed_by_question[key]
            item["dispute_count"] += 1
            if dispute.get("dispute_accepted"):
                item["accepted_disputes"] += 1
            item["original_scores"].append(int(dispute["original_score"]))

    per_question = [
        PerQuestionAnalytics(
            question_index=index,
            attempts=len(scores),
            average_score=_round_one(sum(scores) / len(scores)),
            average_time_seconds=_round_one(
                sum(times_by_index[index]) / len(times_by_index[index])
            ),
            topics=[
                topic
                for topic, _count in topics_by_index[index].most_common(5)
            ],
        )
        for index, scores in sorted(scores_by_index.items())
        if scores
    ]

    most_disputed = [
        DisputedQuestionAnalytics(
            question_index=item["question_index"],
            topic=item["topic"],
            question=item["question"],
            dispute_count=item["dispute_count"],
            accepted_disputes=item["accepted_disputes"],
            average_original_score=_round_one(
                sum(item["original_scores"]) / len(item["original_scores"])
            ),
        )
        for item in sorted(
            disputed_by_question.values(),
            key=lambda value: (
                value["dispute_count"],
                value["accepted_disputes"],
            ),
            reverse=True,
        )[:5]
        if item["original_scores"]
    ]

    sessions = [
        AnalyticsSession(
            session_id=exam["session_id"],
            student_name=exam["student_name"],
            domain=exam["domain"],
            completed_at=exam["completed_at"],
            num_questions=exam["num_questions"],
            composite_score=_effective_composite_score(exam),
            dispute_count=sum(
                1
                for question in exam.get("questions", [])
                if question.get("dispute_result") is not None
            ),
        )
        for exam in sorted(
            _completed_exams,
            key=lambda item: item["completed_at"],
            reverse=True,
        )
    ]

    return ExamAnalyticsResponse(
        completed_sessions=len(_completed_exams),
        overall_average_score=(
            _round_one(sum(composite_scores) / len(composite_scores))
            if composite_scores
            else 0.0
        ),
        average_time_per_question=(
            _round_one(total_time / total_questions) if total_questions else 0.0
        ),
        score_distribution=distribution,
        per_question_average_scores=per_question,
        most_disputed_questions=most_disputed,
        sessions=sessions,
    )


# ── Student exam flow ────────────────────────────────────────────────────────


@app.post("/api/start-exam", response_model=StartExamResponse)
async def start_exam(request: StartExamRequest) -> StartExamResponse:
    special_instructions = ""
    domain = request.domain
    topics = list(request.topics)
    num_questions = request.num_questions
    difficulty: Difficulty = request.difficulty
    grade_level: GradeLevel = request.grade_level
    grading_personality: GradingPersonality = request.grading_personality
    teacher_name = request.teacher_name

    if request.config_id is not None:
        config = _exam_configs.get(request.config_id)
        if config is None:
            raise HTTPException(
                status_code=404,
                detail=f"Exam config {request.config_id!r} not found.",
            )
        domain = config["domain"]
        topics = list(config["topics"])
        num_questions = config["num_questions"]
        difficulty = config["difficulty"]
        grade_level = config["grade_level"]
        grading_personality = config["grading_personality"]
        teacher_name = config["teacher_name"]
        special_instructions = config["special_instructions"]

    session_id = uuid.uuid4().hex
    _exam_sessions[session_id] = {
        "session_id": session_id,
        "student_name": request.student_name,
        "domain": domain,
        "difficulty": difficulty,
        "grade_level": grade_level,
        "grading_personality": grading_personality,
        "teacher_name": teacher_name,
        "num_questions": num_questions,
        "topics": topics,
        "config_id": request.config_id,
        "special_instructions": special_instructions,
        "questions": [],  # list[dict]
        "pending_question": None,  # dict | None (generated but not yet answered)
        "tutor_sessions": {},  # question index string -> list[dict]
        "status": "in_progress",
        "created_at": _now_iso(),
    }

    return StartExamResponse(
        session_id=session_id,
        student_name=request.student_name,
        domain=domain,
        difficulty=difficulty,
        grade_level=grade_level,
        grading_personality=grading_personality,
        teacher_name=teacher_name,
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
        "Focus the question specifically on this subtopic: "
        f"{focus_topic}. Set the topic field exactly to this subtopic."
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
    grade_level: GradeLevel = session["grade_level"]
    grade_level_guidance = GRADE_LEVEL_QUESTION_STYLE[grade_level]

    system_prompt = (
        "You are an expert educational assessment designer. Generate exactly "
        "one essay question tailored to the given domain, difficulty, grade "
        "level, and "
        "subtopic constraints. Respond only with valid JSON matching this "
        f"schema: {prompt_schema}. "
        "The background_info must be a short paragraph of context. "
        "The question must be a single essay prompt. "
        "The grading_rubric must be 3-5 concise criteria. "
        "The topic must be a short 2-6 word label naming the subtopic. "
        f"Difficulty guidance: {style_guidance} "
        f"Grade level guidance: {grade_level_guidance} "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {difficulty}\n"
        f"Grade level: {grade_level}\n"
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
        "topic": focus_topic
        or generated.topic.strip()
        or f"Question {question_index + 1}",
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
    grade_level: GradeLevel = session["grade_level"]
    grade_expectations = GRADE_LEVEL_GRADING_EXPECTATIONS[grade_level]
    grading_personality: GradingPersonality = session["grading_personality"]
    personality_guidance = GRADING_PERSONALITY_GUIDANCE[grading_personality]
    teacher_name = session["teacher_name"]
    feedback_label = _feedback_label(teacher_name)
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
        f"Grade level calibration: {grade_expectations} "
        f"Grading personality: {personality_guidance} "
        "Feedback identity: the grading_explanation must begin with "
        f"{feedback_label!r}. "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {difficulty}\n"
        f"Grade level: {grade_level}\n\n"
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
        "grading_explanation": _ensure_named_feedback(
            graded.grading_explanation,
            teacher_name,
        ),
        "dispute_result": None,
    }
    session["questions"].append(record)
    session["pending_question"] = None

    return GradeAnswerResponse(
        criterion_scores=aligned_scores,
        overall_score=graded.overall_score,
        grading_explanation=record["grading_explanation"],
        question_index=question_index,
    )


@app.post("/api/dispute-grade", response_model=GradeDisputeResponse)
async def dispute_grade(request: GradeDisputeRequest) -> GradeDisputeResponse:
    session = _require_session(request.session_id)

    if request.question_index >= len(session["questions"]):
        raise HTTPException(
            status_code=404,
            detail=f"Question index {request.question_index} not found.",
        )

    question = session["questions"][request.question_index]
    if question.get("dispute_result") is not None:
        raise HTTPException(
            status_code=400,
            detail="This question has already been disputed.",
        )

    original_score = int(question["overall_score"])
    prompt_schema = build_prompt_schema(LLMGradeDisputeDecision)
    rubric_lines = "\n".join(
        f"{index}. {criterion}"
        for index, criterion in enumerate(question["grading_rubric"], start=1)
    )
    criterion_lines = "\n".join(
        (
            f"- {score['criterion']}: {score['score']}/100. "
            f"Feedback: {score['feedback']}"
        )
        for score in question["criterion_scores"]
    )

    system_prompt = (
        "You are an impartial grade appeals reviewer. Evaluate whether the "
        "student's dispute identifies a genuine grading issue, such as "
        "evidence in the original answer that was overlooked, a rubric "
        "misapplication, or an explanation that shows the original score was "
        "too low. Do not award credit for new facts introduced only in the "
        "dispute unless they point to content already present in the original "
        "answer. If the dispute has merit, accept it and issue a higher "
        "revised_score. If it lacks merit, uphold the original score and set "
        "revised_score equal to the original score. Respond only with valid "
        f"JSON matching this schema: {prompt_schema}. "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {session['difficulty']}\n"
        f"Grade level: {session['grade_level']}\n"
        f"Question topic: {question['topic']}\n\n"
        f"Question:\n{question['question']}\n\n"
        f"Background info:\n{question['background_info']}\n\n"
        f"Rubric:\n{rubric_lines}\n\n"
        f"Student's original answer:\n{question['student_answer']}\n\n"
        "Original grading result:\n"
        f"Overall score: {original_score}/100\n"
        f"Grading explanation: {question['grading_explanation']}\n"
        f"Per-criterion scores:\n{criterion_lines}\n\n"
        f"Student's dispute argument:\n{request.dispute_argument}"
    )

    decision = await call_together_json(
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        response_model=LLMGradeDisputeDecision,
        temperature=0.2,
    )

    accepted = decision.dispute_accepted and decision.revised_score > original_score
    revised_score = decision.revised_score if accepted else original_score
    result = GradeDisputeResponse(
        dispute_accepted=accepted,
        original_score=original_score,
        revised_score=revised_score,
        reviewer_explanation=decision.reviewer_explanation.strip(),
    )

    question["dispute_result"] = result.model_dump()

    completed_exam = _find_completed_exam(request.session_id)
    if completed_exam is not None:
        for completed_question in completed_exam.get("questions", []):
            if completed_question["question_index"] == request.question_index:
                completed_question["dispute_result"] = result.model_dump()
                break

    return result


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
    grade_level: GradeLevel = session["grade_level"]
    grade_expectations = GRADE_LEVEL_GRADING_EXPECTATIONS[grade_level]
    grading_personality: GradingPersonality = session["grading_personality"]
    personality_guidance = GRADING_PERSONALITY_GUIDANCE[grading_personality]
    teacher_name = session["teacher_name"]
    feedback_label = _feedback_label(teacher_name)

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
        f"Grade level calibration: {grade_expectations} "
        f"Grading personality: {personality_guidance} "
        "Feedback identity: the composite_feedback must begin with "
        f"{feedback_label!r}. "
        "Do not include markdown, code fences, or any extra text."
    )

    user_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {difficulty}\n"
        f"Grade level: {grade_level}\n"
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
            dispute_result=(
                GradeDisputeResponse(**q["dispute_result"])
                if q.get("dispute_result")
                else None
            ),
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
        grade_level=grade_level,
        grading_personality=grading_personality,
        teacher_name=teacher_name,
        num_questions=session["num_questions"],
        questions=question_reports,
        composite_score=composite.composite_score,
        composite_feedback=_ensure_named_feedback(
            composite.composite_feedback,
            teacher_name,
        ),
        total_time_seconds=total_time,
        completed_at=completed_at,
    )

    session["status"] = "completed"
    _completed_exams.append(result.model_dump())

    return result


@app.post("/api/tutor-session", response_model=TutorSessionResponse)
async def tutor_session(request: TutorSessionRequest) -> TutorSessionResponse:
    session = _require_session(request.session_id)

    if request.question_index >= len(session["questions"]):
        raise HTTPException(
            status_code=404,
            detail=f"Question index {request.question_index} not found.",
        )

    question = session["questions"][request.question_index]
    tutor_sessions: dict[str, list[dict[str, Any]]] = session.setdefault(
        "tutor_sessions",
        {},
    )
    key = str(request.question_index)
    history = tutor_sessions.setdefault(key, [])

    incoming = request.message.strip()
    if history and not incoming:
        return TutorSessionResponse(
            session_id=request.session_id,
            question_index=request.question_index,
            messages=[TutorMessage(**message) for message in history],
        )

    if incoming:
        history.append(
            {
                "role": "student",
                "content": incoming,
                "created_at": _now_iso(),
            }
        )

    prompt_schema = build_prompt_schema(LLMTutorTurn)
    system_prompt = (
        "You are a patient tutor helping a student study after an exam. "
        "Re-explain the topic area in simpler terms, diagnose the student's "
        "misunderstanding from their original answer and grading feedback, "
        "ask one manageable follow-up question at a time, and give hints "
        "rather than direct answers. Keep the tone supportive and concrete. "
        "Respond only with valid JSON matching this schema: "
        f"{prompt_schema}. Do not include markdown, code fences, or any "
        "extra text."
    )
    context_prompt = (
        f"Domain: {session['domain']}\n"
        f"Difficulty: {session['difficulty']}\n"
        f"Grade level: {session['grade_level']}\n"
        f"Topic: {question['topic']}\n"
        f"Question:\n{question['question']}\n\n"
        f"Student's original answer:\n{question['student_answer']}\n\n"
        f"Original score: {question['overall_score']}/100\n"
        f"Grading feedback:\n{question['grading_explanation']}\n\n"
        "Begin or continue a tutoring conversation. If this is the first "
        "turn, start with a short re-explanation and then ask a simpler "
        "follow-up question."
    )

    llm_messages: list[dict[str, str]] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": context_prompt},
    ]
    for message in history:
        llm_messages.append(
            {
                "role": "assistant" if message["role"] == "tutor" else "user",
                "content": message["content"],
            }
        )
    if not history:
        llm_messages.append(
            {
                "role": "user",
                "content": "Please start the tutoring session now.",
            }
        )

    tutor_turn = await call_together_json(
        messages=llm_messages,
        response_model=LLMTutorTurn,
        temperature=0.5,
    )
    history.append(
        {
            "role": "tutor",
            "content": tutor_turn.message.strip(),
            "created_at": _now_iso(),
        }
    )

    return TutorSessionResponse(
        session_id=request.session_id,
        question_index=request.question_index,
        messages=[TutorMessage(**message) for message in history],
    )
