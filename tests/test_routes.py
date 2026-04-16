from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import main


@pytest.fixture(autouse=True)
def _clean_state() -> None:
    main._exam_configs.clear()
    main._exam_sessions.clear()
    main._completed_exams.clear()


@pytest.fixture
def client() -> TestClient:
    return TestClient(main.app)


def test_health_endpoints_return_ok(client: TestClient) -> None:
    for path in ("/", "/health"):
        response = client.get(path)

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_configure_exam_persists_and_returns_config(client: TestClient) -> None:
    response = client.post(
        "/api/configure-exam",
        json={
            "domain": "Roman History",
            "topics": ["Fall of Rome", "Pax Romana"],
            "num_questions": 3,
            "difficulty": "medium",
            "special_instructions": "Emphasize primary sources.",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["domain"] == "Roman History"
    assert payload["topics"] == ["Fall of Rome", "Pax Romana"]
    assert payload["num_questions"] == 3
    assert payload["difficulty"] == "medium"
    assert payload["config_id"]

    listing = client.get("/api/exam-configs").json()
    assert len(listing) == 1
    assert listing[0]["config_id"] == payload["config_id"]


def test_start_exam_rejects_invalid_question_count(client: TestClient) -> None:
    response = client.post(
        "/api/start-exam",
        json={"domain": "Math", "num_questions": 99, "difficulty": "easy"},
    )

    assert response.status_code == 422


def test_generate_question_errors_when_session_missing(client: TestClient) -> None:
    response = client.post(
        "/api/generate-question",
        json={"session_id": "does-not-exist"},
    )

    assert response.status_code == 404


def test_full_exam_flow_grades_and_finishes(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    generate_call_count = {"count": 0}

    async def fake_call_together_json(**kwargs: Any) -> Any:
        model = kwargs["response_model"]
        if model is main.LLMGeneratedQuestion:
            generate_call_count["count"] += 1
            index = generate_call_count["count"]
            return main.LLMGeneratedQuestion(
                background_info=f"Context for question {index}.",
                question=f"Essay question #{index}?",
                grading_rubric=["Explains the topic", "Uses evidence"],
                topic=f"Subtopic {index}",
            )
        if model is main.GradeAnswerResponse:
            return main.GradeAnswerResponse(
                criterion_scores=[
                    main.CriterionScore(
                        criterion="Explains the topic",
                        score=82,
                        feedback="Add more specific examples.",
                    ),
                    main.CriterionScore(
                        criterion="Uses evidence",
                        score=88,
                        feedback="Good citations; cite one more source.",
                    ),
                ],
                overall_score=85,
                grading_explanation="Solid answer; add one concrete example.",
                question_index=0,
            )
        if model is main.LLMComposite:
            return main.LLMComposite(
                composite_score=86,
                composite_feedback="Strong work overall; deepen evidence.",
            )
        raise AssertionError(f"Unexpected response_model: {model}")

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    start_response = client.post(
        "/api/start-exam",
        json={
            "domain": "Roman History",
            "num_questions": 2,
            "difficulty": "medium",
            "topics": ["Fall of Rome", "Pax Romana"],
            "student_name": "Livia",
        },
    )
    assert start_response.status_code == 200
    session_id = start_response.json()["session_id"]

    for expected_index in range(2):
        q = client.post(
            "/api/generate-question", json={"session_id": session_id}
        )
        assert q.status_code == 200
        assert q.json()["question_index"] == expected_index
        assert q.json()["total_questions"] == 2

        g = client.post(
            "/api/grade-answer",
            json={
                "session_id": session_id,
                "student_answer": "My answer references political decline.",
                "time_spent_seconds": 300,
            },
        )
        assert g.status_code == 200
        assert g.json()["overall_score"] == 85

    finish = client.post("/api/finish-exam", json={"session_id": session_id})
    assert finish.status_code == 200
    body = finish.json()
    assert body["composite_score"] == 86
    assert body["num_questions"] == 2
    assert len(body["questions"]) == 2
    assert body["total_time_seconds"] == 600
    assert body["student_name"] == "Livia"

    results = client.get("/api/exam-results").json()
    assert len(results["exams"]) == 1
    assert results["exams"][0]["student_name"] == "Livia"


def test_generate_question_rejects_when_exam_full(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_call_together_json(**kwargs: Any) -> Any:
        model = kwargs["response_model"]
        if model is main.LLMGeneratedQuestion:
            return main.LLMGeneratedQuestion(
                background_info="Context.",
                question="Only essay question?",
                grading_rubric=["Clear explanation"],
                topic="Sole topic",
            )
        if model is main.GradeAnswerResponse:
            return main.GradeAnswerResponse(
                criterion_scores=[
                    main.CriterionScore(
                        criterion="Clear explanation",
                        score=70,
                        feedback="Organize the argument more clearly.",
                    ),
                ],
                overall_score=70,
                grading_explanation="Clear enough; tighten structure.",
                question_index=0,
            )
        raise AssertionError(f"Unexpected model {model}")

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    start = client.post(
        "/api/start-exam",
        json={"domain": "History", "num_questions": 1, "difficulty": "easy"},
    ).json()
    session_id = start["session_id"]

    client.post("/api/generate-question", json={"session_id": session_id})
    client.post(
        "/api/grade-answer",
        json={
            "session_id": session_id,
            "student_answer": "Something.",
            "time_spent_seconds": 60,
        },
    )

    second = client.post(
        "/api/generate-question", json={"session_id": session_id}
    )
    assert second.status_code == 400
    assert "already been generated" in second.json()["detail"]


def test_grade_answer_rejects_wrong_criterion_count(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_call_together_json(**kwargs: Any) -> Any:
        model = kwargs["response_model"]
        if model is main.LLMGeneratedQuestion:
            return main.LLMGeneratedQuestion(
                background_info="Context.",
                question="Essay?",
                grading_rubric=["A", "B"],
                topic="Topic",
            )
        if model is main.GradeAnswerResponse:
            return main.GradeAnswerResponse(
                criterion_scores=[
                    main.CriterionScore(
                        criterion="A",
                        score=80,
                        feedback="Add evidence.",
                    ),
                ],
                overall_score=80,
                grading_explanation="Explanation.",
                question_index=0,
            )
        raise AssertionError

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    start = client.post(
        "/api/start-exam",
        json={"domain": "History", "num_questions": 1, "difficulty": "easy"},
    ).json()

    client.post("/api/generate-question", json={"session_id": start["session_id"]})

    graded = client.post(
        "/api/grade-answer",
        json={
            "session_id": start["session_id"],
            "student_answer": "Answer.",
            "time_spent_seconds": 60,
        },
    )

    assert graded.status_code == 502
    assert "wrong number of items" in graded.json()["detail"]


def test_finish_exam_rejects_no_graded_answers(client: TestClient) -> None:
    start = client.post(
        "/api/start-exam",
        json={"domain": "History", "num_questions": 1, "difficulty": "easy"},
    ).json()

    response = client.post(
        "/api/finish-exam", json={"session_id": start["session_id"]}
    )

    assert response.status_code == 400
