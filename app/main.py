"""Local-first API for the versioned EngCalc bolt-shear yield estimate."""

from datetime import datetime, timezone
import json
import math
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, ConfigDict, Field, conint, field_validator
from sqlalchemy.orm import Session

from app.calculators.fastener import (
    CALCULATOR_VERSION,
    FORMULA_SOURCE,
    MODEL_ID,
    REPORT_SCHEMA_VERSION,
    ASSUMPTIONS,
    LIMITATIONS,
    bolt_shear_margin,
)
from app.database import CalculationReport, SessionLocal


app = FastAPI(title="EngCalc", version=CALCULATOR_VERSION)
app.mount("/static", StaticFiles(directory="app/static", check_dir=False), name="static")


@app.middleware("http")
async def restrict_local_host_and_browser_origin(request: Request, call_next):
    # Uvicorn is bound to loopback. Reject hostile Host values to prevent DNS
    # rebinding from reaching the local service through an attacker hostname.
    if request.url.hostname not in {"127.0.0.1", "localhost", "::1"}:
        return JSONResponse(status_code=403, content={"detail": "EngCalc accepts loopback Host names only."})
    origin = request.headers.get("origin")
    if origin is not None:
        expected_origin = "%s://%s" % (request.url.scheme, request.url.netloc)
        if origin != expected_origin:
            return JSONResponse(status_code=403, content={"detail": "Cross-origin requests are not accepted."})
    return await call_next(request)


class ShearRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    tensile_yield_strength_MPa: float = Field(..., gt=0, allow_inf_nan=False)
    diameter_mm: float = Field(..., gt=0, allow_inf_nan=False)
    applied_shear_N: float = Field(..., gt=0, allow_inf_nan=False)
    shear_planes: conint(strict=True, ge=1, le=2) = 1
    fitting_factor: float = Field(1.0, ge=1.0, allow_inf_nan=False)

    @field_validator(
        "tensile_yield_strength_MPa",
        "diameter_mm",
        "applied_shear_N",
        "fitting_factor",
        mode="before",
    )
    @classmethod
    def reject_boolean_or_non_numeric_values(cls, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("must be a JSON number, not a boolean or string")
        try:
            finite_value = float(value)
        except (OverflowError, ValueError):
            raise ValueError("must be a finite JSON number")
        if not math.isfinite(finite_value):
            raise ValueError("must be finite")
        return value


def _build_report(request: ShearRequest):
    calculation = bolt_shear_margin(
        tensile_yield_strength_MPa=request.tensile_yield_strength_MPa,
        diameter_mm=request.diameter_mm,
        applied_shear_N=request.applied_shear_N,
        shear_planes=request.shear_planes,
        fitting_factor=request.fitting_factor,
    ).as_dict()
    now = datetime.now(timezone.utc)
    report_id = str(uuid4())
    return {
        "report_id": report_id,
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "calculator_version": CALCULATOR_VERSION,
        "created_at": now.isoformat(timespec="seconds"),
        "model": {
            "id": MODEL_ID,
            "name": "Idealized von Mises bolt-shank shear yield",
            "purpose": "Educational estimate of nominal yield load under stated assumptions",
        },
        "inputs": {
            "tensile_yield_strength": {
                "value": float(request.tensile_yield_strength_MPa),
                "unit": "MPa",
                "note": "User supplied; not checked against a material or fastener specification.",
            },
            "shank_diameter": {"value": float(request.diameter_mm), "unit": "mm"},
            "applied_shear_load": {"value": float(request.applied_shear_N), "unit": "N"},
            "shear_planes": {"value": request.shear_planes, "unit": "count"},
            "load_factor": {"value": float(request.fitting_factor), "unit": "dimensionless"},
        },
        "formula": {
            "shear_yield_strength": "tau_y = Fy / sqrt(3)",
            "shank_area": "A = pi * d^2 / 4",
            "total_nominal_yield_capacity": "C = tau_y * A * n",
            "factored_demand": "D = V * FF",
            "margin_of_safety": "MS = C / D - 1",
            "unit_note": "MPa = N/mm^2, so strength (MPa) times area (mm^2) gives force (N).",
        },
        "intermediates": {
            "von_mises_shear_yield_strength": {
                "value": calculation["shear_yield_strength_MPa"],
                "unit": "MPa",
            },
            "full_circular_shank_area": {"value": calculation["bolt_area_mm2"], "unit": "mm^2"},
            "nominal_yield_capacity_per_plane": {
                "value": calculation["nominal_yield_capacity_per_plane_N"],
                "unit": "N",
            },
            "factored_applied_load_per_plane": {
                "value": calculation["applied_load_per_plane_N"],
                "unit": "N",
            },
        },
        "result": {
            "total_nominal_yield_capacity_N": calculation["total_nominal_yield_capacity_N"],
            "factored_applied_load_N": calculation["factored_applied_load_N"],
            "margin_of_safety": calculation["margin_of_safety"],
            "status": calculation["status"],
            "boundary_relative_tolerance": calculation["boundary_relative_tolerance"],
        },
        "assumptions": ASSUMPTIONS,
        "limitations": LIMITATIONS,
        "formula_source": FORMULA_SOURCE,
    }


def _save_report(report):
    session: Session = SessionLocal()
    try:
        session.add(
            CalculationReport(
                report_id=report["report_id"],
                created_at=datetime.fromisoformat(report["created_at"]),
                report_schema_version=report["report_schema_version"],
                calculator_version=report["calculator_version"],
                report_json=json.dumps(report, ensure_ascii=False, separators=(",", ":")),
            )
        )
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


@app.get("/")
def root():
    return {"status": "ok", "version": CALCULATOR_VERSION}


@app.get("/ui")
def ui():
    return FileResponse("app/static/index.html")


@app.post("/calculate/shear", include_in_schema=False)
def retired_grade_endpoint():
    return JSONResponse(
        status_code=410,
        content={
            "detail": "The grade-preset calculation was retired because its property sources and conditions were not verified.",
            "replacement": "POST /api/v1/calculations/bolt-shear",
            "required_input": "tensile_yield_strength_MPa (a user-verified nominal tensile yield value)",
            "units": {"tensile_yield_strength_MPa": "MPa", "diameter_mm": "mm", "applied_shear_N": "N"},
        },
    )


@app.post("/api/v1/calculations/bolt-shear")
def calculate_shear(request: ShearRequest):
    try:
        report = _build_report(request)
        _save_report(report)
        return report
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))


@app.get("/api/v1/reports/{report_id}")
def get_report(report_id: str):
    session: Session = SessionLocal()
    try:
        row = session.get(CalculationReport, report_id)
        if row is None:
            raise HTTPException(status_code=404, detail="Calculation report not found")
        return json.loads(row.report_json)
    finally:
        session.close()
