"""Idealized bolt-shank shear-yield estimate for the EngCalc v1 report."""

import math
from dataclasses import asdict, dataclass


CALCULATOR_VERSION = "1.0.0"
REPORT_SCHEMA_VERSION = "1.0"
MODEL_ID = "von-mises-pure-shear-yield-v1"
FORMULA_SOURCE = {
    "title": "Yield and Plastic Flow",
    "author": "David Roylance, MIT Department of Materials Science and Engineering",
    "url": "https://web.mit.edu/course/3/3.11/www/modules/yield.pdf",
    "location": "Printed page 5 (PDF page 5), pure-shear von Mises yield derivation",
}
ASSUMPTIONS = [
    "Static, concentric, pure shear on the bolt shank.",
    "Ductile, isotropic material; user-provided tensile yield strength represents the same material and condition.",
    "The full circular, unthreaded shank area carries the load at each shear plane.",
    "Shear planes share the factored applied load equally.",
    "The load factor is user-selected and multiplies the applied shear load.",
]
LIMITATIONS = [
    "This is an educational idealized yield estimate, not an allowable, safety certification, or design approval.",
    "It does not check ultimate failure, thread shear, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading.",
    "Do not use the full-shank area if a thread crosses the shear plane.",
    "Choose and verify material properties, load factor, geometry, and all omitted failure modes for the actual application.",
]


@dataclass(frozen=True)
class ShearResult:
    model_id: str
    formula: str
    tensile_yield_strength_MPa: float
    shear_yield_strength_MPa: float
    diameter_mm: float
    bolt_area_mm2: float
    shear_planes: int
    applied_shear_N: float
    fitting_factor: float
    factored_applied_load_N: float
    applied_load_per_plane_N: float
    nominal_yield_capacity_per_plane_N: float
    total_nominal_yield_capacity_N: float
    margin_of_safety: float
    status: str
    boundary_relative_tolerance: float
    assumptions: list
    limitations: list
    source: dict

    def as_dict(self):
        return asdict(self)


def _positive_finite(name, value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("%s must be a finite positive number" % name)
    try:
        value = float(value)
    except (OverflowError, ValueError):
        raise ValueError("%s must be a finite positive number" % name)
    if not math.isfinite(value) or value <= 0.0:
        raise ValueError("%s must be a finite positive number" % name)
    return value


def _finite_derived(**values):
    if any(not math.isfinite(value) for value in values.values()):
        raise ValueError("Inputs are outside the calculator's finite numeric range")
    if any(value <= 0.0 for value in values.values()):
        raise ValueError("Inputs produce a zero or non-positive derived value")


def bolt_shear_margin(
    tensile_yield_strength_MPa,
    diameter_mm,
    applied_shear_N,
    shear_planes=1,
    fitting_factor=1.0,
):
    """Return a versioned-model result using user-entered nominal tensile yield.

    The model uses the von Mises pure-shear yield relation tau_y = Fy/sqrt(3),
    full circular shank area, equally shared shear planes, and a user-applied
    load multiplier. MPa equals N/mm^2, so strength times area yields newtons.
    """
    fy = _positive_finite("tensile_yield_strength_MPa", tensile_yield_strength_MPa)
    diameter = _positive_finite("diameter_mm", diameter_mm)
    applied = _positive_finite("applied_shear_N", applied_shear_N)
    factor = _positive_finite("fitting_factor", fitting_factor)
    if factor < 1.0:
        raise ValueError("fitting_factor must be at least 1.0")
    if isinstance(shear_planes, bool) or not isinstance(shear_planes, int):
        raise ValueError("shear_planes must be the integer 1 or 2")
    if shear_planes not in (1, 2):
        raise ValueError("shear_planes must be the integer 1 or 2")

    try:
        area = math.pi * (diameter / 2.0) ** 2
        shear_yield = fy / math.sqrt(3.0)
        capacity_per_plane = shear_yield * area
        total_capacity = capacity_per_plane * shear_planes
        factored_load = applied * factor
        load_per_plane = factored_load / shear_planes
    except OverflowError:
        raise ValueError("Inputs are outside the calculator's finite numeric range")

    _finite_derived(
        bolt_area_mm2=area,
        shear_yield_strength_MPa=shear_yield,
        nominal_yield_capacity_per_plane_N=capacity_per_plane,
        total_nominal_yield_capacity_N=total_capacity,
        factored_applied_load_N=factored_load,
        applied_load_per_plane_N=load_per_plane,
    )

    margin = total_capacity / factored_load - 1.0
    if not math.isfinite(margin):
        raise ValueError("Inputs produce a margin outside the calculator's finite numeric range")
    # Treat differences within 1e-12 relative capacity as the model boundary.
    on_boundary = math.isclose(total_capacity, factored_load, rel_tol=1e-12, abs_tol=0.0)
    if on_boundary:
        status = "AT_MODELED_YIELD"
        margin = 0.0
    elif margin > 0.0:
        status = "WITHIN_MODELED_YIELD"
    else:
        status = "ABOVE_MODELED_YIELD"

    return ShearResult(
        model_id=MODEL_ID,
        formula="tau_y = Fy / sqrt(3); A = pi * d^2 / 4; MS = (tau_y * A * n) / (V * FF) - 1",
        tensile_yield_strength_MPa=fy,
        shear_yield_strength_MPa=shear_yield,
        diameter_mm=diameter,
        bolt_area_mm2=area,
        shear_planes=shear_planes,
        applied_shear_N=applied,
        fitting_factor=factor,
        factored_applied_load_N=factored_load,
        applied_load_per_plane_N=load_per_plane,
        nominal_yield_capacity_per_plane_N=capacity_per_plane,
        total_nominal_yield_capacity_N=total_capacity,
        margin_of_safety=margin,
        status=status,
        boundary_relative_tolerance=1e-12,
        assumptions=list(ASSUMPTIONS),
        limitations=list(LIMITATIONS),
        source=dict(FORMULA_SOURCE),
    )
