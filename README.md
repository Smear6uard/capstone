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
