"""API contract tests use a fresh temporary SQLite database per test."""

import importlib
import json

import pytest
from fastapi.testclient import TestClient


@pytest.fixture
def client(tmp_path, monkeypatch):
    database_path = tmp_path / "api-test.sqlite3"
    monkeypatch.setenv("DATABASE_URL", "sqlite:///" + database_path.as_posix())
    import app.database as database

    importlib.reload(database)
    import app.main as main

    importlib.reload(main)
    with TestClient(main.app, base_url="http://127.0.0.1") as test_client:
        yield test_client


def valid_body():
    return {
        "tensile_yield_strength_MPa": 640,
        "diameter_mm": 8,
        "applied_shear_N": 10_000,
        "shear_planes": 1,
        "fitting_factor": 1.0,
    }


def test_v1_report_is_versioned_and_retrievable(client):
    response = client.post("/api/v1/calculations/bolt-shear", json=valid_body())

    assert response.status_code == 200
    report = response.json()
    assert report["report_schema_version"] == "1.0"
    assert report["calculator_version"] == "1.0.0"
    assert report["inputs"]["shank_diameter"] == {"value": 8.0, "unit": "mm"}
    assert report["result"]["total_nominal_yield_capacity_N"] == pytest.approx(18_573.3054898)
    assert client.get("/api/v1/reports/" + report["report_id"]).json() == report


@pytest.mark.parametrize(
    ("field", "raw_value"),
    [
        ("tensile_yield_strength_MPa", "NaN"),
        ("diameter_mm", "Infinity"),
        ("applied_shear_N", "-Infinity"),
        ("fitting_factor", "1e10000"),
        ("tensile_yield_strength_MPa", "9" * 1000),
    ],
)
def test_nonfinite_and_overflowing_json_numbers_return_422(client, field, raw_value):
    body = valid_body()
    body[field] = json.loads(raw_value) if raw_value in {"NaN", "Infinity", "-Infinity"} else int(raw_value) if len(raw_value) > 100 else float(raw_value)
    response = client.post("/api/v1/calculations/bolt-shear", content=json.dumps(body, allow_nan=True))

    assert response.status_code == 422
    assert response.headers["content-type"].startswith("application/json")
    assert "detail" in response.json()


def test_boolean_extra_fields_and_old_grade_endpoint_are_rejected_clearly(client):
    body = valid_body()
    body["shear_planes"] = True
    assert client.post("/api/v1/calculations/bolt-shear", json=body).status_code == 422

    body = valid_body()
    body["grade"] = "NAS_3"
    assert client.post("/api/v1/calculations/bolt-shear", json=body).status_code == 422

    retired = client.post("/calculate/shear", json={"grade": "NAS_3"})
    assert retired.status_code == 410
    assert retired.json()["replacement"] == "POST /api/v1/calculations/bolt-shear"


def test_unknown_report_returns_404(client):
    assert client.get("/api/v1/reports/not-a-report").status_code == 404


def test_same_origin_local_browser_request_is_allowed(client):
    response = client.post(
        "/api/v1/calculations/bolt-shear",
        json=valid_body(),
        headers={"Origin": "http://127.0.0.1"},
    )
    assert response.status_code == 200


def test_cross_origin_and_non_loopback_host_are_rejected(client):
    for origin in ("https://attacker.example", "null"):
        cross_origin = client.post(
            "/api/v1/calculations/bolt-shear",
            json=valid_body(),
            headers={"Origin": origin},
        )
        assert cross_origin.status_code == 403
        assert "Cross-origin" in cross_origin.json()["detail"]

    preflight = client.options(
        "/api/v1/calculations/bolt-shear",
        headers={"Origin": "https://attacker.example", "Access-Control-Request-Method": "POST"},
    )
    assert preflight.status_code == 403

    hostile_host = client.get("/api/v1/reports/missing", headers={"Host": "attacker.example"})
    assert hostile_host.status_code == 403
    assert "loopback" in hostile_host.json()["detail"]
