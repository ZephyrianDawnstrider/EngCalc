"""Independent checks for the idealized bolt-shear yield model."""

import math

import pytest

from app.calculators.fastener import bolt_shear_margin


def test_hand_calculated_fy640_m8_single_shear_case():
    result = bolt_shear_margin(640, 8, 10_000)

    assert result.bolt_area_mm2 == pytest.approx(50.2654824574)
    assert result.shear_yield_strength_MPa == pytest.approx(369.504172281)
    assert result.nominal_yield_capacity_per_plane_N == pytest.approx(18_573.3054898)
    assert result.total_nominal_yield_capacity_N == pytest.approx(18_573.3054898)
    assert result.factored_applied_load_N == 10_000
    assert result.margin_of_safety == pytest.approx(0.85733054898)
    assert result.status == "WITHIN_MODELED_YIELD"


def test_double_shear_doubles_capacity_and_shares_load_equally():
    single = bolt_shear_margin(640, 8, 10_000, shear_planes=1)
    double = bolt_shear_margin(640, 8, 10_000, shear_planes=2)

    assert double.total_nominal_yield_capacity_N == pytest.approx(single.total_nominal_yield_capacity_N * 2)
    assert double.applied_load_per_plane_N == pytest.approx(5_000)
    assert double.margin_of_safety == pytest.approx(2 * single.margin_of_safety + 1.0)


def test_load_factor_changes_demand_not_nominal_capacity():
    base = bolt_shear_margin(640, 8, 10_000, fitting_factor=1)
    factored = bolt_shear_margin(640, 8, 10_000, fitting_factor=1.15)

    assert factored.total_nominal_yield_capacity_N == base.total_nominal_yield_capacity_N
    assert factored.factored_applied_load_N == pytest.approx(11_500)
    assert factored.margin_of_safety < base.margin_of_safety


def test_exact_yield_boundary_is_reported_as_boundary():
    capacity = (640 / math.sqrt(3)) * math.pi * (8 / 2) ** 2

    result = bolt_shear_margin(640, 8, capacity)

    assert result.status == "AT_MODELED_YIELD"
    assert result.margin_of_safety == 0.0


def test_just_above_yield_is_not_reported_as_within_model():
    capacity = (640 / math.sqrt(3)) * math.pi * (8 / 2) ** 2

    result = bolt_shear_margin(640, 8, capacity * 1.001)

    assert result.status == "ABOVE_MODELED_YIELD"
    assert result.margin_of_safety < 0


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("tensile_yield_strength_MPa", 0),
        ("tensile_yield_strength_MPa", -1),
        ("diameter_mm", 0),
        ("diameter_mm", -1),
        ("applied_shear_N", 0),
        ("applied_shear_N", -1),
        ("fitting_factor", 0.99),
        ("tensile_yield_strength_MPa", float("nan")),
        ("diameter_mm", float("inf")),
        ("applied_shear_N", float("-inf")),
        ("fitting_factor", float("nan")),
    ],
)
def test_rejects_non_positive_or_non_finite_values(field, value):
    values = {
        "tensile_yield_strength_MPa": 640,
        "diameter_mm": 8,
        "applied_shear_N": 10_000,
        "shear_planes": 1,
        "fitting_factor": 1,
    }
    values[field] = value

    with pytest.raises(ValueError):
        bolt_shear_margin(**values)


@pytest.mark.parametrize("planes", [0, 3, -1, 1.0, True, "2"])
def test_rejects_invalid_or_non_integer_shear_plane_counts(planes):
    with pytest.raises(ValueError, match="shear_planes"):
        bolt_shear_margin(640, 8, 10_000, shear_planes=planes)


def test_rejects_derived_overflow_and_underflow():
    with pytest.raises(ValueError, match="numeric range|derived value"):
        bolt_shear_margin(1e308, 1e308, 1)

    with pytest.raises(ValueError, match="numeric range|derived value"):
        bolt_shear_margin(640, 1e-300, 10_000)
