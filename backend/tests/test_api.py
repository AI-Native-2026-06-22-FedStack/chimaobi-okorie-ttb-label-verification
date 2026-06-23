from __future__ import annotations

import io
import json

from fastapi.testclient import TestClient
from PIL import Image

from app.main import app
from app.models import CANONICAL_GOVERNMENT_WARNING, ExtractedLabel
from app.vision import FakeVisionService


def image_bytes() -> bytes:
    output = io.BytesIO()
    Image.new("RGB", (80, 80), color="white").save(output, format="PNG")
    return output.getvalue()


def application_data() -> dict[str, str]:
    return {
        "brand_name": "Old Harbor",
        "class_type": "Straight Bourbon Whiskey",
        "abv": "45%",
        "net_contents": "750 mL",
        "producer": "Okorie Spirits Co.",
        "country_of_origin": "United States",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
    }


def extracted(**overrides: str) -> ExtractedLabel:
    data = {
        "brand_name": "Old Harbor",
        "class_type": "Straight Bourbon Whiskey",
        "abv": "45% Alc./Vol. (90 Proof)",
        "net_contents": "750ml",
        "producer": "Okorie Spirits Co.",
        "country_of_origin": "USA",
        "government_warning": CANONICAL_GOVERNMENT_WARNING,
        "raw_text": "sample label",
        "extraction_confidence": 0.96,
    }
    data.update(overrides)
    return ExtractedLabel(**data)


def client_with_fake(fake: ExtractedLabel) -> TestClient:
    app.state.vision_service = FakeVisionService(fake)
    return TestClient(app)


def test_verify_returns_full_result_with_latency_and_failure_details():
    misread = CANONICAL_GOVERNMENT_WARNING.replace("machinery", "machinerv")
    client = client_with_fake(extracted(government_warning=misread))
    response = client.post(
        "/verify",
        data={"application_data": json.dumps(application_data())},
        files={"image": ("label.png", image_bytes(), "image/png")},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["overall_verdict"] == "NEEDS_REVIEW"
    assert isinstance(payload["latency_ms"], int)
    warning = next(item for item in payload["results"] if item["field"] == "government_warning")
    assert warning["expected"] == CANONICAL_GOVERNMENT_WARNING
    assert warning["found"] == misread


def test_verify_rejects_bad_file_type_readably():
    client = client_with_fake(extracted())
    response = client.post(
        "/verify",
        data={"application_data": json.dumps(application_data())},
        files={"image": ("label.txt", b"not an image", "text/plain")},
    )
    assert response.status_code == 400
    assert "JPG, PNG, or WebP" in response.json()["detail"]


def test_verify_rejects_empty_submission_readably():
    client = client_with_fake(extracted())
    response = client.post(
        "/verify",
        data={"application_data": json.dumps(application_data())},
        files={"image": ("label.png", b"", "image/png")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"]


def test_verify_rejects_malformed_application_json_readably():
    client = client_with_fake(extracted())
    response = client.post(
        "/verify",
        data={"application_data": "{not-json"},
        files={"image": ("label.png", image_bytes(), "image/png")},
    )
    assert response.status_code == 400
    assert "Invalid application data" in response.json()["detail"]


def test_batch_processes_three_labels_and_summarizes():
    client = client_with_fake(extracted())
    items = [
        {"id": "A", "application_data": application_data()},
        {"id": "B", "application_data": application_data()},
        {"id": "C", "application_data": application_data()},
    ]
    response = client.post(
        "/verify/batch",
        data={"items": json.dumps(items)},
        files=[
            ("images", ("a.png", image_bytes(), "image/png")),
            ("images", ("b.png", image_bytes(), "image/png")),
            ("images", ("c.png", image_bytes(), "image/png")),
        ],
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {"passed": 3, "needs_review": 0, "total": 3}
    assert len(payload["items"]) == 3


def test_batch_isolates_one_bad_item():
    client = client_with_fake(extracted())
    bad_data = application_data()
    bad_data["brand_name"] = ""
    items = [
        {"id": "A", "application_data": application_data()},
        {"id": "B", "application_data": bad_data},
        {"id": "C", "application_data": application_data()},
    ]
    response = client.post(
        "/verify/batch",
        data={"items": json.dumps(items)},
        files=[
            ("images", ("a.png", image_bytes(), "image/png")),
            ("images", ("b.png", image_bytes(), "image/png")),
            ("images", ("c.png", image_bytes(), "image/png")),
        ],
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"] == {"passed": 2, "needs_review": 1, "total": 3}
    assert payload["items"][1]["error"]


def test_batch_mismatched_counts_returns_readable_error():
    client = client_with_fake(extracted())
    response = client.post(
        "/verify/batch",
        data={"items": json.dumps([{"id": "A", "application_data": application_data()}])},
        files=[
            ("images", ("a.png", image_bytes(), "image/png")),
            ("images", ("b.png", image_bytes(), "image/png")),
        ],
    )
    assert response.status_code == 400
    assert "data item" in response.json()["detail"]
