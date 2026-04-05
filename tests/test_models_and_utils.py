from __future__ import annotations

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from app.main import (
    GenerateQuestionRequest,
    GenerateQuestionResponse,
    GradeAnswerRequest,
    build_prompt_schema,
    extract_together_content,
    get_together_api_key,
    parse_llm_content,
)


def test_generate_question_request_trims_domain() -> None:
    request = GenerateQuestionRequest(domain="  Roman History  ", difficulty="medium")

    assert request.domain == "Roman History"


def test_generate_question_request_rejects_blank_domain() -> None:
    with pytest.raises(ValidationError):
        GenerateQuestionRequest(domain="   ", difficulty="easy")


def test_grade_answer_request_trims_text_fields_and_rubric() -> None:
    request = GradeAnswerRequest(
        question="  Explain the causes.  ",
        grading_rubric=[" Uses evidence ", " Organized clearly "],
        background_info="  Students studied late antiquity.  ",
        student_answer="  The empire weakened over time.  ",
        time_spent_seconds=120,
    )

    assert request.question == "Explain the causes."
    assert request.grading_rubric == ["Uses evidence", "Organized clearly"]
    assert request.background_info == "Students studied late antiquity."
    assert request.student_answer == "The empire weakened over time."


def test_grade_answer_request_rejects_blank_rubric_items() -> None:
    with pytest.raises(ValidationError):
        GradeAnswerRequest(
            question="Explain the causes.",
            grading_rubric=["Valid criterion", "   "],
            background_info="Students studied late antiquity.",
            student_answer="The empire weakened over time.",
            time_spent_seconds=120,
        )


def test_build_prompt_schema_contains_model_fields() -> None:
    schema = build_prompt_schema(GenerateQuestionResponse)

    assert "background_info" in schema
    assert "grading_rubric" in schema
    assert "question" in schema


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


def test_get_together_api_key_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TOGETHER_API_KEY", "secret-key")

    assert get_together_api_key() == "secret-key"


def test_get_together_api_key_requires_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("TOGETHER_API_KEY", raising=False)

    with pytest.raises(HTTPException) as exc_info:
        get_together_api_key()

    assert exc_info.value.status_code == 500
    assert "TOGETHER_API_KEY is not set" in exc_info.value.detail
