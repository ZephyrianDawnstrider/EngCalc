"""Golden report oracle built from the backend's pure calculator only."""

import json
import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))

from app.calculators.fastener import (  # noqa: E402
    ASSUMPTIONS,
    CALCULATOR_VERSION,
    FORMULA_SOURCE,
    LIMITATIONS,
    MODEL_ID,
    REPORT_SCHEMA_VERSION,
    bolt_shear_margin,
)


REPORT_ID = "00000000-0000-4000-8000-000000000001"
CREATED_AT = "2026-01-02T03:04:05+00:00"
DEFAULTS = {"shear_planes": 1, "fitting_factor": 1.0}
INPUT_KEYS = {
    "tensile_yield_strength_MPa",
    "diameter_mm",
    "applied_shear_N",
    "shear_planes",
    "fitting_factor",
}
REQUIRED_KEYS = {
    "tensile_yield_strength_MPa",
    "diameter_mm",
    "applied_shear_N",
}


def decode(value):
    if isinstance(value, dict) and set(value) == {"$number"}:
        return {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf}[value["$number"]]
    if isinstance(value, dict):
        return {key: decode(item) for key, item in value.items()}
    if isinstance(value, list):
        return [decode(item) for item in value]
    return value


def report_for(inputs):
    values = dict(DEFAULTS)
    values.update(inputs)
    calculation = bolt_shear_margin(**values).as_dict()
    return {
        "report_id": REPORT_ID,
        "report_schema_version": REPORT_SCHEMA_VERSION,
        "calculator_version": CALCULATOR_VERSION,
        "created_at": CREATED_AT,
        "model": {
            "id": MODEL_ID,
            "name": "Idealized von Mises bolt-shank shear yield",
            "purpose": "Educational estimate of nominal yield load under stated assumptions",
        },
        "inputs": {
            "tensile_yield_strength": {
                "value": float(values["tensile_yield_strength_MPa"]),
                "unit": "MPa",
                "note": "User supplied; not checked against a material or fastener specification.",
            },
            "shank_diameter": {"value": float(values["diameter_mm"]), "unit": "mm"},
            "applied_shear_load": {"value": float(values["applied_shear_N"]), "unit": "N"},
            "shear_planes": {"value": values["shear_planes"], "unit": "count"},
            "load_factor": {"value": float(values["fitting_factor"]), "unit": "dimensionless"},
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


def cases():
    capacity = bolt_shear_margin(640, 8, 1).total_nominal_yield_capacity_N
    return [
        {"name": "defaults-and-hand-example", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000}},
        {"name": "two-planes-and-factor", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000, "shear_planes": 2, "fitting_factor": 1.15}},
        {"name": "exact-yield-boundary", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": capacity}},
        {"name": "inside-relative-boundary", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": capacity * (1 + 0.5e-12)}},
        {"name": "outside-relative-boundary", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": capacity * (1 + 2e-12)}},
        {"name": "factorized-boundary", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": capacity / 1.15, "fitting_factor": 1.15}},
        {"name": "large-valid-range", "inputs": {"tensile_yield_strength_MPa": 1e100, "diameter_mm": 1e-50, "applied_shear_N": 1e50}},
        {"name": "reject-boolean-strength", "inputs": {"tensile_yield_strength_MPa": True, "diameter_mm": 8, "applied_shear_N": 10000}},
        {"name": "reject-string-strength", "inputs": {"tensile_yield_strength_MPa": "640", "diameter_mm": 8, "applied_shear_N": 10000}},
        {"name": "reject-nan-strength", "inputs": {"tensile_yield_strength_MPa": {"$number": "NaN"}, "diameter_mm": 8, "applied_shear_N": 10000}},
        {"name": "reject-infinite-diameter", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": {"$number": "Infinity"}, "applied_shear_N": 10000}},
        {"name": "reject-zero-load", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 0}},
        {"name": "reject-factor-below-one", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000, "fitting_factor": 0.99}},
        {"name": "reject-boolean-planes", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000, "shear_planes": True}},
        {"name": "reject-fractional-planes", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000, "shear_planes": 1.5}},
        {"name": "reject-null-defaulted-factor", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000, "fitting_factor": None}},
        {"name": "reject-unknown-field", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 10000, "grade": "8.8"}},
        {"name": "reject-capacity-overflow", "inputs": {"tensile_yield_strength_MPa": 1e308, "diameter_mm": 1e308, "applied_shear_N": 1}},
        {"name": "reject-area-underflow", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 1e-300, "applied_shear_N": 10000}},
        {"name": "reject-per-plane-underflow", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 5e-324, "shear_planes": 2}},
        {"name": "reject-capacity-underflow", "inputs": {"tensile_yield_strength_MPa": 5e-324, "diameter_mm": 1e-100, "applied_shear_N": 10000}},
        {"name": "reject-factored-load-overflow", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8, "applied_shear_N": 1e308, "fitting_factor": 2}},
        {"name": "reject-margin-overflow", "inputs": {"tensile_yield_strength_MPa": 1, "diameter_mm": 1e154, "applied_shear_N": 1e-308}},
        {"name": "reject-missing-required", "inputs": {"tensile_yield_strength_MPa": 640, "diameter_mm": 8}},
    ]


def main():
    output = []
    for spec in cases():
        inputs = decode(spec["inputs"])
        if set(inputs) - INPUT_KEYS or REQUIRED_KEYS - set(inputs):
            output.append({**spec, "accepted": False})
            continue
        try:
            output.append({**spec, "accepted": True, "report": report_for(inputs)})
        except (ValueError, OverflowError, TypeError):
            output.append({**spec, "accepted": False})
    print(json.dumps(output, allow_nan=False, separators=(",", ":")))


if __name__ == "__main__":
    main()
