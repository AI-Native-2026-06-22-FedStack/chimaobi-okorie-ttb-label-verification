# TTB Label Verification

Proof-of-concept web app for checking alcohol label images against structured TTB application data. The app is stateless: the browser sends an image plus application values to a FastAPI backend, the backend extracts label fields with a vision model, compares each field, and returns per-field `PASS` / `FAIL` plus an overall verdict.

## Architecture

- Frontend: plain HTML, CSS, and JavaScript hosted on Vercel.
- Backend: Python FastAPI hosted on Render.
- Vision: OpenAI Responses API image input with strict structured JSON output.
- Storage: none. Each request is self-contained.
- Secrets: environment variables only. No API keys are committed.

## Comparison Rules

- Brand name, class/type, producer: normalized fuzzy match at threshold `0.90`.
- Country of origin: normalized aliases such as `USA`, `U.S.A.`, and `United States`.
- Alcohol content: numeric ABV normalization with `+/- 0.1` tolerance.
- Net contents: unit normalization to milliliters.
- Government warning: exact case-sensitive match after whitespace collapse only.
- Verdict: any failed field returns `NEEDS_REVIEW`; all fields passing returns `APPROVED`.

## Local Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
```

Create local secrets from the example file:

```bash
cp .env.example .env
```

Set `OPENAI_API_KEY` in `.env` before using real vision extraction.

## Run Locally

Backend:

```bash
cd backend
../.venv/bin/uvicorn app.main:app --reload
```

Frontend:

```bash
cd frontend
API_BASE_URL=http://localhost:8000 npm run build
python3 -m http.server 5173
```

Open `http://localhost:5173`.

## Tests

```bash
cd backend
../.venv/bin/pytest
```

The tests use a fake vision service and do not call the OpenAI API.

## API

`GET /health`

- Returns backend status.

`POST /verify`

- Multipart form field `image`: JPG, PNG, or WebP.
- Multipart form field `application_data`: JSON matching the seven application fields.
- Returns `VerificationResult` with field results, expected/found values, overall verdict, and `latency_ms`.

`POST /verify/batch`

- Multipart form field `images`: repeated image files.
- Multipart form field `items`: JSON array matching the image order. Each item has `id` and `application_data`.
- Returns `BatchResult` with per-item result or error plus summary counts.

## Deployment

Render backend:

1. Create a Render Blueprint from this repository.
2. Render will use `render.yaml`.
3. Set `OPENAI_API_KEY` as a secret environment variable.
4. Set `FRONTEND_ORIGINS` to the deployed Vercel URL.
5. Confirm `GET /health` returns `{"status":"ok","service":"ttb-label-verification-api"}`.

Vercel frontend:

1. Deploy the `frontend` directory.
2. Set `API_BASE_URL` to the Render backend URL before the Vercel build.
3. Confirm the Vercel page shows `OK - API connected`.

Live URLs:

- Backend: add the Render URL after Blueprint deployment.
- Frontend: add the Vercel URL after deployment.

## Submission Audit

Run before final submission:

```bash
git status --short
git grep -n -E 'sk-[A-Za-z0-9_-]{20,}' -- ':!.venv'
git check-ignore .env
cd backend && ../.venv/bin/pytest
```

Expected audit result:

- `.env` is ignored.
- No OpenAI API key pattern is present in committed source.
- Backend tests pass.

## Assumptions And Limitations

- Real extraction requires `OPENAI_API_KEY` on the backend host.
- Model can be changed with `VISION_MODEL`; default is `gpt-4o-mini`.
- The frontend is intentionally plain HTML/CSS/JS for simple hosting and review.
- Batch concurrency is bounded with `BATCH_CONCURRENCY` to reduce rate and cost pressure.
- Government-warning OCR/model mistakes intentionally return `NEEDS_REVIEW` and surface extracted text for manual inspection.
- This environment does not have the Render CLI, so Render deployment must be completed through the Render Blueprint flow.

