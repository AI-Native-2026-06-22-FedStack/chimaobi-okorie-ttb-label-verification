# TTB Label Verification

Proof-of-concept web app for checking alcohol label images against structured TTB application data. A plain JavaScript frontend sends an image plus application values to a FastAPI backend, the backend extracts label fields with an OpenAI vision model, compares each field, and returns per-field `PASS` / `FAIL` plus an overall verdict.

## Final Submission Links

Public repo: [https://github.com/AI-Native-2026-06-22-FedStack/chimaobi-okorie-ttb-label-verification](https://github.com/AI-Native-2026-06-22-FedStack/chimaobi-okorie-ttb-label-verification)

Live frontend: [https://ttb-label-verification-frontend-zgnb.vercel.app/](https://ttb-label-verification-frontend-zgnb.vercel.app/)

Backend API: [https://ttb-label-verification-api-zgnb.onrender.com](https://ttb-label-verification-api-zgnb.onrender.com)

Backend health: [https://ttb-label-verification-api-zgnb.onrender.com/health](https://ttb-label-verification-api-zgnb.onrender.com/health)

## What Is Implemented

- Single-label verification flow with image upload, seven application fields, loading state, readable errors, per-field results, and `APPROVED` / `NEEDS REVIEW` verdict.
- Batch verification flow with multiple image/data pairs, bounded backend concurrency, per-item error isolation, summary counts, and drill-down field details.
- FastAPI backend with `GET /health`, `POST /verify`, and `POST /verify/batch`.
- OpenAI Responses API vision extraction with strict structured JSON output.
- Image preprocessing that downscales and re-encodes uploads before model calls.
- Stateless request handling with no database.
- Tests that use a fake vision service so automated checks do not call the OpenAI API.

## Architecture

- Frontend: plain HTML, CSS, and JavaScript hosted on Vercel.
- Backend: Python FastAPI hosted on Render.
- Vision service: OpenAI image input returning an `ExtractedLabel` schema.
- Comparison engine: pure Python functions over typed Pydantic models.
- Storage: none; each request is self-contained.
- Secrets: environment variables only.

## Data And Comparison Rules

The application checks seven fields: `brand_name`, `class_type`, `abv`, `net_contents`, `producer`, `country_of_origin`, and `government_warning`.

- Brand name, class/type, producer: normalized fuzzy match at threshold `0.90`.
- Country of origin: normalized aliases such as `USA`, `U.S.A.`, `United States`, `UK`, and `United Kingdom`.
- Alcohol content: numeric ABV normalization with `+/- 0.1` tolerance.
- Net contents: unit normalization to milliliters with `+/- 1.0 mL` tolerance.
- Government warning: exact case-sensitive match after whitespace collapse only.
- Verdict: any failed field returns `NEEDS_REVIEW`; all fields passing returns `APPROVED`.

## Local Setup

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements-dev.txt
cp .env.example .env
```

For real local vision extraction, add a fresh OpenAI API key to `.env`:

```text
OPENAI_API_KEY=your_new_key_here
```

The previously exposed key should be revoked and replaced.

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

Open [http://localhost:5173](http://localhost:5173).

## API

`GET /health`

- Returns backend status.

`POST /verify`

- Multipart field `image`: JPG, PNG, or WebP.
- Multipart field `application_data`: JSON matching the seven application fields.
- Returns field results, expected/found values, overall verdict, and `latency_ms`.

`POST /verify/batch`

- Multipart field `images`: repeated image files.
- Multipart field `items`: JSON array matching image order. Each item has `id` and `application_data`.
- Returns per-item result or error plus summary counts: `passed`, `needs_review`, and `total`.

## Deployment

Render backend:

- Uses `render.yaml`.
- Keeps `PYTHON_VERSION=3.13.5` to avoid Python 3.14 package build issues.
- Stores `OPENAI_API_KEY` as a secret environment variable in Render only.
- Runs `pip install -r requirements.txt`.
- Starts with `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.

Vercel frontend:

- Deploys the `frontend` directory.
- Build command: `npm run build`.
- Output directory: `.`.
- Build-time env var: `API_BASE_URL=https://ttb-label-verification-api-zgnb.onrender.com`.

## Secret Handling

- Render gets `OPENAI_API_KEY`.
- Vercel gets `API_BASE_URL`.
- Local development can use `.env`.
- `.env.example` contains placeholders only.
- Never put an OpenAI API key in README, GitHub, Vercel, `render.yaml`, `.env.example`, or chat.

## Tests And Submission Audit

Run backend tests:

```bash
cd backend
../.venv/bin/pytest
```

Run the final audit:

```bash
git status --short
git grep -n -E 'sk-[A-Za-z0-9_-]{20,}' -- ':!.venv'
git check-ignore .env
curl https://ttb-label-verification-api-zgnb.onrender.com/health
```

Expected results:

- `.env` is ignored.
- No OpenAI API key pattern appears in committed source.
- Backend tests pass.
- Backend health returns `{"status":"ok","service":"ttb-label-verification-api"}`.

## Assumptions And Limitations

- Real extraction requires a valid `OPENAI_API_KEY` on the backend host.
- `VISION_MODEL` defaults to `gpt-4o-mini` and can be changed with an environment variable.
- Government-warning OCR/model mistakes intentionally return `NEEDS_REVIEW` and surface extracted text for manual inspection.
- Batch concurrency is bounded with `BATCH_CONCURRENCY` to reduce rate and cost pressure.
