from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.main import (
    ConfigureExamRequest,
    GenerateQuestionResponse,
    GradeAnswerRequest,
    StartExamRequest,
    build_prompt_schema,
    extract_together_content,
    get_together_api_key,
    normalize_criterion_name,
    parse_llm_content,
)


def test_configure_exam_request_trims_fields_and_drops_empty_topics() -> None:
    request = ConfigureExamRequest(
        domain="  Roman History  ",
        topics=["  Causes of fall  ", "", "   ", "Economic collapse"],
        num_questions=3,
        difficulty="medium",
        special_instructions="  Focus on late antiquity  ",
    )

    assert request.domain == "Roman History"
    assert request.topics == ["Causes of fall", "Economic collapse"]
    assert request.num_questions == 3
    assert request.difficulty == "medium"


def test_configure_exam_request_rejects_blank_domain() -> None:
    with pytest.raises(ValidationError):
        ConfigureExamRequest(
            domain="   ",
            num_questions=3,
            difficulty="easy",
        )


def test_configure_exam_request_rejects_out_of_range_question_count() -> None:
    with pytest.raises(ValidationError):
        ConfigureExamRequest(
            domain="Roman History",
            num_questions=11,
            difficulty="easy",
        )
    with pytest.raises(ValidationError):
        ConfigureExamRequest(
            domain="Roman History",
            num_questions=0,
            difficulty="easy",
        )


def test_start_exam_request_trims_and_defaults_student_name() -> None:
    request = StartExamRequest(
        domain="  Roman History  ",
        num_questions=2,
        difficulty="hard",
    )

    assert request.domain == "Roman History"
    assert request.student_name == "Anonymous Student"
    assert request.topics == []
    assert request.config_id is None


def test_grade_answer_request_trims_student_answer() -> None:
    request = GradeAnswerRequest(
        session_id="abc",
        student_answer="  The empire weakened over time.  ",
        time_spent_seconds=120,
    )

    assert request.student_answer == "The empire weakened over time."


def test_grade_answer_request_rejects_blank_student_answer() -> None:
    with pytest.raises(ValidationError):
        GradeAnswerRequest(
            session_id="abc",
            student_answer="   ",
            time_spent_seconds=120,
        )


def test_build_prompt_schema_contains_model_fields() -> None:
    schema = build_prompt_schema(GenerateQuestionResponse)

    assert "background_info" in schema
    assert "grading_rubric" in schema
    assert "question" in schema
    assert "topic" in schema


def test_parse_llm_content_accepts_fenced_json() -> None:
    parsed = parse_llm_content(
        """
        ```json
        {"question":"Why did Rome fall?"}
        ```
        """
    )

    assert parsed == {"question": "Why did Rome fall?"}


def test_parse_llm_content_rejects_invalid_json() -> None:
    with pytest.raises(HTTPException) as exc_info:
        parse_llm_content("not-json")

    assert exc_info.value.status_code == 502
    assert "not valid JSON" in exc_info.value.detail


def test_extract_together_content_rejects_invalid_shape() -> None:
    with pytest.raises(HTTPException) as exc_info:
        extract_together_content({"choices": []})

    assert exc_info.value.status_code == 502
    assert "unexpected response shape" in exc_info.value.detail


def test_normalize_criterion_name_strips_list_prefixes_and_case() -> None:
    assert normalize_criterion_name("1. Uses supporting evidence") == (
        "uses supporting evidence"
    )
    assert normalize_criterion_name("Criterion 2: Explains causes") == (
        "explains causes"
    )
    assert normalize_criterion_name("  multiple   spaces  ") == "multiple spaces"


def test_get_together_api_key_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TOGETHER_API_KEY", "secret-key")

    assert get_together_api_key() == "secret-key"


def test_get_together_api_key_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TOGETHER_API_KEY", raising=False)

    with pytest.raises(HTTPException) as exc_info:
        get_together_api_key()

    assert exc_info.value.status_code == 500
    assert "TOGETHER_API_KEY is not set" in exc_info.value.detail
