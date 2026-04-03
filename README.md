# Capstone Question Generator API

FastAPI server that generates essay questions by calling the Together AI chat completions API.

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

Example request:

```bash
curl -X POST http://127.0.0.1:8000/api/generate-question \
  -H "Content-Type: application/json" \
  -d '{"domain":"Roman History","difficulty":"medium"}'
```
