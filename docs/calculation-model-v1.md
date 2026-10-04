# EngCalc calculation model v1

**Calculator version:** 1.0.0
**Report schema version:** 1.0
**Model ID:** `von-mises-pure-shear-yield-v1`

This note defines the only calculation currently provided by EngCalc. It is an educational estimate of nominal shank shear yield under explicit simplifying assumptions. It is not a design allowable, safety certification, or design approval.

## Inputs and units

- `Fy`: user-verified nominal tensile yield strength, MPa (N/mm²)
- `d`: smooth unthreaded shank diameter at the shear plane, mm
- `V`: total applied shear load before load factor, N
- `n`: one or two equally loaded shear planes
- `FF`: user-selected load factor, dimensionless and at least 1.0

Strength is not inferred from a grade. EngCalc does not verify the material, product condition, source, or suitability of a supplied value.

## Equations

The idealized von Mises pure-shear yield relation for a ductile isotropic material is:

```text
tau_y = Fy / sqrt(3)
A = pi * d^2 / 4
C_plane = tau_y * A
C_total = C_plane * n
D = V * FF
D_plane = D / n
MS = C_total / D - 1
```

Here `tau_y` is nominal shear yield strength (MPa), `A` is shank area (mm²), `C_plane` and `C_total` are nominal capacities (N), `D` is factored total demand (N), and `MS` is the dimensionless margin relative to this model. Since MPa is N/mm², multiplying strength by area gives force in newtons.

For a hand-check example with `Fy=640 MPa`, `d=8 mm`, `V=10000 N`, `n=1`, and `FF=1`, the area is `50.265482 mm²`, shear yield is `369.504172 MPa`, total nominal capacity is `18573.305490 N`, and margin is `0.857330549`. With two equal planes the total nominal capacity doubles and each plane carries half the factored demand.

Values within a relative tolerance of `1e-12` of equal total capacity and factored demand are reported as `AT_MODELED_YIELD` with zero margin. Other statuses are `WITHIN_MODELED_YIELD` and `ABOVE_MODELED_YIELD`; these describe this model only and do not mean a connection is safe or unsafe.

## Assumptions and limitations

The calculation assumes static, concentric, pure shear; ductile isotropic material behavior; user-supplied tensile yield strength for the same material and condition; a smooth full circular shank at every shear plane; equal load sharing; and a user-selected multiplier applied to total load.

It does not model ultimate failure, threads crossing the shear plane, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading. It does not check a particular material, fastener specification, joint geometry, or design code. A qualified engineer must assess the actual application and all relevant failure modes.

## Source and correction

The equation `tau_y = Fy / sqrt(3)` follows the von Mises yield criterion for pure shear as derived in David Roylance, MIT Department of Materials Science and Engineering, [Yield and Plastic Flow](https://web.mit.edu/course/3/3.11/www/modules/yield.pdf), printed page 5 (PDF page 5). The report returns this source with every calculation.

The earlier application described a `0.577 * Ftu` relation as a Von Mises shear-strength equation supported by “NASA-TM-2012-217454 §3.1 Eq. 3/5.” That citation and description were not supported: the NASA technical memorandum is a report on combined shear and tension failure tests, and its section numbering does not substantiate that claimed derivation. Version 1 removes that formula and the unsourced grade presets. The original README is preserved in [the dated archive](history/README-2026-10-03-before-v1.md).


## 4 October 2026 — scope update (browser v0.3.0)

The shear v1 definition and historical correction above remain unchanged. Its earlier statement that it is the only calculation is superseded: a separate [educational round-shank axial-yield model](axial-yield-model-v1.md) is now defined for the browser app. It has a distinct report schema and history key; no combined-loading or connection check is implied, and the v1 shear report contract is unchanged.
