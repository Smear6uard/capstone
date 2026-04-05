from __future__ import annotations

from fastapi.testclient import TestClient

from app import main


client = TestClient(main.app)


def test_health_endpoints_return_ok() -> None:
    for path in ("/", "/health"):
        response = client.get(path)

        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_generate_question_rejects_blank_domain() -> None:
    response = client.post(
        "/api/generate-question",
        json={"domain": "   ", "difficulty": "medium"},
    )

    assert response.status_code == 422


def test_generate_question_returns_model_response(monkeypatch) -> None:
    async def fake_call_together_json(**kwargs):
        assert kwargs["schema_name"] == "generated_question"
        assert kwargs["response_model"] is main.GenerateQuestionResponse
        assert "Domain: Roman History" in kwargs["messages"][1]["content"]
        return main.GenerateQuestionResponse(
            background_info="Students studied the fall of Rome.",
            question="Why did the Western Roman Empire fall?",
            grading_rubric=["Explains multiple causes", "Uses supporting evidence"],
        )

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    response = client.post(
        "/api/generate-question",
        json={"domain": "  Roman History  ", "difficulty": "hard"},
    )

    assert response.status_code == 200
    assert response.json()["question"] == "Why did the Western Roman Empire fall?"


def test_grade_answer_returns_model_response(monkeypatch) -> None:
    async def fake_call_together_json(**kwargs):
        assert kwargs["schema_name"] == "graded_answer"
        assert kwargs["response_model"] is main.GradeAnswerResponse
        assert "1. Uses supporting evidence" in kwargs["messages"][1]["content"]
        assert "Time spent (seconds): 780.0" in kwargs["messages"][1]["content"]
        return main.GradeAnswerResponse(
            criterion_scores=[
                main.CriterionScore(
                    criterion="Uses supporting evidence",
                    score=90,
                    feedback="The answer cites historically relevant pressures.",
                ),
                main.CriterionScore(
                    criterion="Explains multiple causes",
                    score=85,
                    feedback="The answer covers political, economic, and military issues.",
                ),
            ],
            overall_score=88,
            grading_explanation="Strong coverage of the main causes with concise support.",
        )

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    response = client.post(
        "/api/grade-answer",
        json={
            "question": "Explain the causes of Rome's fall.",
            "grading_rubric": [
                "Uses supporting evidence",
                "Explains multiple causes",
            ],
            "background_info": "Students studied late antiquity.",
            "student_answer": "Rome weakened because of leadership instability, economics, and invasions.",
            "time_spent_seconds": 780,
        },
    )

    assert response.status_code == 200
    assert response.json()["overall_score"] == 88


def test_grade_answer_rejects_wrong_number_of_criteria(monkeypatch) -> None:
    async def fake_call_together_json(**kwargs):
        return main.GradeAnswerResponse(
            criterion_scores=[
                main.CriterionScore(
                    criterion="Uses supporting evidence",
                    score=90,
                    feedback="The answer cites relevant examples.",
                )
            ],
            overall_score=90,
            grading_explanation="One criterion was returned instead of two.",
        )

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    response = client.post(
        "/api/grade-answer",
        json={
            "question": "Explain the causes of Rome's fall.",
            "grading_rubric": [
                "Uses supporting evidence",
                "Explains multiple causes",
            ],
            "background_info": "Students studied late antiquity.",
            "student_answer": "Rome weakened because of leadership instability, economics, and invasions.",
            "time_spent_seconds": 780,
        },
    )

    assert response.status_code == 502
    assert "wrong number of items" in response.json()["detail"]


def test_grade_answer_rejects_wrong_criterion_names(monkeypatch) -> None:
    async def fake_call_together_json(**kwargs):
        return main.GradeAnswerResponse(
            criterion_scores=[
                main.CriterionScore(
                    criterion="Uses supporting evidence",
                    score=90,
                    feedback="The answer cites relevant examples.",
                ),
                main.CriterionScore(
                    criterion="Adds outside facts",
                    score=80,
                    feedback="The answer adds some unsupported details.",
                ),
            ],
            overall_score=85,
            grading_explanation="The criterion names do not match the request.",
        )

    monkeypatch.setattr(main, "call_together_json", fake_call_together_json)

    response = client.post(
        "/api/grade-answer",
        json={
            "question": "Explain the causes of Rome's fall.",
            "grading_rubric": [
                "Uses supporting evidence",
                "Explains multiple causes",
            ],
            "background_info": "Students studied late antiquity.",
            "student_answer": "Rome weakened because of leadership instability, economics, and invasions.",
            "time_spent_seconds": 780,
        },
    )

    assert response.status_code == 502
    assert "criterion names that did not match" in response.json()["detail"]
