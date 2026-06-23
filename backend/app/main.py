from __future__ import annotations

import logging
import asyncio
import json
import time
from typing import Annotated

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import ValidationError

from .comparison import compare_label
from .models import ApplicationData, BatchItemResult, BatchResult, VerificationResult
from .settings import settings
from .vision import OpenAIVisionService, VisionError

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
logger = logging.getLogger("ttb_label_verification")

app = FastAPI(title="TTB Label Verification API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.frontend_origins,
    allow_origin_regex=r"https://.*\.vercel\.app",
    allow_credentials=False,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.state.vision_service = OpenAIVisionService()


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ttb-label-verification-api"}


@app.post("/verify", response_model=VerificationResult)
async def verify(
    request: Request,
    image: Annotated[UploadFile, File(...)],
    application_data: Annotated[str, Form(...)],
) -> VerificationResult:
    expected = _parse_application_data(application_data)
    image_bytes = await _read_image(image)
    return await _verify_one(request, image_bytes, image.content_type or "", expected)


@app.post("/verify/batch", response_model=BatchResult)
async def verify_batch(
    request: Request,
    images: Annotated[list[UploadFile], File(...)],
    items: Annotated[str, Form(...)],
) -> BatchResult:
    parsed_items = _parse_batch_items(items)
    if len(parsed_items) != len(images):
        raise HTTPException(
            status_code=400,
            detail=f"Batch has {len(parsed_items)} data item(s) but {len(images)} image file(s).",
        )

    semaphore = asyncio.Semaphore(settings.batch_concurrency)

    async def run_one(index: int) -> BatchItemResult:
        item_id = str(parsed_items[index].get("id") or f"Label {index + 1}")
        try:
            expected = ApplicationData.model_validate(parsed_items[index]["application_data"])
            image_bytes = await _read_image(images[index])
            async with semaphore:
                result = await _verify_one(request, image_bytes, images[index].content_type or "", expected)
            return BatchItemResult(item_id=item_id, result=result)
        except HTTPException as exc:
            return BatchItemResult(item_id=item_id, error=str(exc.detail))
        except (KeyError, ValidationError) as exc:
            return BatchItemResult(item_id=item_id, error=f"Invalid application data: {exc}")

    batch_items = await asyncio.gather(*(run_one(index) for index in range(len(images))))
    passed = sum(1 for item in batch_items if item.result and item.result.overall_verdict == "APPROVED")
    needs_review = len(batch_items) - passed
    return BatchResult(
        items=batch_items,
        summary={"passed": passed, "needs_review": needs_review, "total": len(batch_items)},
    )


async def _verify_one(
    request: Request,
    image_bytes: bytes,
    content_type: str,
    expected: ApplicationData,
) -> VerificationResult:
    started = time.perf_counter()
    try:
        extracted = await request.app.state.vision_service.extract_label(image_bytes, content_type)
    except VisionError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    latency_ms = int((time.perf_counter() - started) * 1000)
    result = compare_label(expected, extracted, latency_ms=latency_ms)
    logger.info("verify completed verdict=%s latency_ms=%s", result.overall_verdict, latency_ms)
    return result


def _parse_application_data(value: str) -> ApplicationData:
    try:
        return ApplicationData.model_validate_json(value)
    except ValidationError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid application data: {exc}") from exc


def _parse_batch_items(value: str) -> list[dict]:
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=400, detail="Batch items must be valid JSON.") from exc
    if not isinstance(parsed, list) or not parsed:
        raise HTTPException(status_code=400, detail="Batch must include at least one label item.")
    return parsed


async def _read_image(image: UploadFile) -> bytes:
    if not image.filename:
        raise HTTPException(status_code=400, detail="Choose an image file before submitting.")
    if image.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(status_code=400, detail="Use a JPG, PNG, or WebP image file.")
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="The uploaded image is empty.")
    if len(image_bytes) > settings.max_image_bytes:
        limit_mb = settings.max_image_bytes // (1024 * 1024)
        raise HTTPException(status_code=413, detail=f"Image is too large. Use a file under {limit_mb} MB.")
    return image_bytes
