# Capstone Question Generator API

FastAPI server that generates essay questions and grades essay answers by calling the Together AI chat completions API.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set `TOGETHER_API_KEY` in `.env`.

## Run

```bash
uvicorn app.main:app --reload
```

The API will be available at `http://127.0.0.1:8000`.

## Test

Backend tests:

```bash
.venv/bin/python -m pytest
```

Frontend tests:

```bash
cd frontend
npm test
```

## Added Test Coverage

- `tests/test_models_and_utils.py`: Adds unit coverage for request-model validation, whitespace trimming, schema generation, JSON parsing, Together response extraction, and `TOGETHER_API_KEY` handling. This protects the backend input contracts and the small utility functions that everything else depends on.
- `tests/test_call_together_json.py`: Adds focused coverage for the Together API client wrapper, including the success path, upstream HTTP failures, network failures, invalid HTTP-layer JSON, and schema mismatches. This is where most backend integration risk lives, so these tests verify the app turns upstream problems into stable FastAPI errors.
- `tests/test_routes.py`: Adds API-level coverage for health checks, request validation, successful question generation, successful grading, and the two grading guardrails that reject malformed rubric results from the LLM. This proves the public backend routes enforce the behavior the frontend relies on.
- `frontend/src/App.test.tsx`: Adds UI-flow coverage for generating a question, grading an answer, resetting back to setup, surfacing question-generation errors, and staying on the question screen after grading failures. These tests protect the main user journey and the most important client-side failure states.
- `frontend/src/test/setup.ts` plus the Vitest config in `frontend/vite.config.ts` and `frontend/tsconfig.app.json`: Adds the shared browser-like test environment, matcher setup, and TypeScript support required for React component testing. This makes the frontend tests runnable and maintainable instead of being one-off ad hoc files.

## Endpoints

- `GET /` health check
- `GET /health` health check
- `POST /api/generate-question`
- `POST /api/grade-answer`

Example request:

```bash
curl -X POST http://127.0.0.1:8000/api/generate-question \
  -H "Content-Type: application/json" \
  -d '{"domain":"Roman History","difficulty":"medium"}'
```

Example grading request:

```bash
curl -X POST http://127.0.0.1:8000/api/grade-answer \
  -H "Content-Type: application/json" \
  -d '{
    "question": "Explain the causes of the fall of the Western Roman Empire.",
    "grading_rubric": [
      "Explains multiple major causes",
      "Uses historically accurate evidence",
      "Organizes the response clearly"
    ],
    "background_info": "Students studied political instability, economic decline, and military pressures in late antiquity.",
    "student_answer": "The empire declined because leaders kept changing, the economy weakened, and outside groups kept invading its borders.",
    "time_spent_seconds": 780
  }'
```
