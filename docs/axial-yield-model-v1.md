# Round-shank axial tensile yield — educational model v1

Recorded 4 October 2026. This is a separate member-mechanics model, introduced in browser app v0.3.0. It is not a threaded-bolt or connection design check.

## Identity and source

- Model ID: `uniform-round-shank-axial-yield-v1`
- Model/calculator version: `1.0.0`
- Report schema: `axial-yield/1.0` (explicitly distinct from the existing shear schema `1.0`)
- Storage: `engcalc.axial-report-history.v1`, envelope version `1`
- Source: David Roylance, MIT, [Stress-Strain Curves](https://web.mit.edu/course/3/3.11/www/modules/ss.pdf), printed/PDF page 1, Eq. (1), defines engineering stress as force divided by original cross-sectional area. Printed/PDF page 3 explains tensile yield stress and the offset-yield convention.

Setting engineering stress equal to the supplied tensile yield value gives the derived nominal yield load `Py = Fy * A0`. This is a derivation from the cited relation, not a code formula. The load factor, margin definition, and numerical boundary tolerance below are explicit EngCalc conventions; the source does not prescribe them as design factors. An offset/proof yield value does not identify the exact first onset of plastic deformation.

## Inputs, equations, and units

| Input | Unit | Required meaning |
| --- | --- | --- |
| `tensile_yield_strength_MPa` / Fy | MPa = N/mm² | User-verified tensile yield property for the actual material and condition; not ultimate strength |
| `diameter_mm` / d | mm | Original diameter of a smooth, solid, constant circular section |
| `axial_force_N` / P | N | Tensile force carried by this member section before the load factor; not automatically the external force on a bolted joint |
| `load_factor` / LF | dimensionless | User-selected multiplier, at least 1.0; not a prescribed code factor |

All four inputs must be present, finite positive numbers. Unknown fields, zero load, and compression are rejected. The UI accepts N or kN and normalizes force to N without display rounding before calculation.

```text
A0 = pi * d^2 / 4                 mm²
D = P * LF                       N
sigma = D / A0                   MPa
Py = Fy * A0                     N
U = D / Py                       dimensionless demand ratio
M = Py / D - 1                   dimensionless model margin
```

The original area remains fixed; no plastic-flow or necking response is calculated. Derived area, demand, stress, yield load, and demand ratio must be finite and strictly positive; the margin must be finite. Overflow and underflow are rejected.

If `abs(Py-D) <= 1e-12 * max(Py,D)`, status is `AT_MODELED_YIELD` and the margin is zero. Otherwise the status is `WITHIN_MODELED_YIELD` or `ABOVE_MODELED_YIELD`, according to the capacity/demand comparison. These names describe only the model boundary; they do not state that a connection is safe, unsafe, or approved.

## Independent example

For `Fy=640 MPa`, `d=8 mm`, `P=10000 N`, `LF=1.25`, a separate Python Decimal calculation using 45 digits of precision and an explicit decimal value of pi gave:

| Quantity | Result |
| --- | ---: |
| Original area | 50.2654824574366918154 mm² |
| Factored demand | 12500 N |
| Engineering stress | 248.679598581086462139 MPa |
| Nominal yield load | 32169.908772759482762 N |
| Demand ratio | 0.388561872782947597 |
| Model margin | 1.573592701820758621 |

The example is illustrative and is not a material-grade recommendation. Doubling the original diameter quadruples area and nominal yield load, and quarters stress at constant load; this is checked separately from the example.

## Assumptions and exclusions

The model assumes a straight, smooth, solid circular section of constant original diameter, homogeneous ductile material, static concentric axial tension, and uniform engineering stress away from load-introduction effects. The supplied material yield convention and condition must be appropriate to the section.

It excludes threads and tensile-stress area, holes/notches/stress concentrations, ultimate fracture and necking, compression/buckling, eccentricity/bending, torsion or combined loading, fatigue/impact, thermal stress/creep, bolt preload, joint stiffness/separation, prying, and load distribution between members. It does not calculate elongation or select material properties. The actual application needs independent assessment of all relevant failure modes.

## Report and compatibility contract

Every axial JSON snapshot includes identity/date, model/schema versions, all four canonical inputs, explicit units, derived values, formulas, assumptions/limitations, source and the derivation note. Opening a snapshot does not recalculate or rewrite it. Comparison accepts axial snapshots only. The pinned baseline is session-only.

The axial store has its own strict schema/evidence/result validation, 50-report and 1 MB limits, no eviction, preservation of corrupt/unsupported data, and raw-history recovery export. It neither reads nor writes `engcalc.report-history.v1`. The v1 shear parser, calculator, and stored bytes remain unchanged, preserving downgrade access to shear history. The browser-only axial module does not introduce an axial FastAPI endpoint.

## Verification

Focused tests cover the independent numeric example, area scaling, equal/near-boundary status, invalid/missing/unknown/nonfinite inputs, numeric range failures, report-evidence tampering, history round trips, duplicate/conflicting IDs, unsupported/corrupt/full/blocked history, cross-schema rejection, and unchanged shear bytes. React DOM journeys cover module isolation, N/kN input, pinned comparison, original-snapshot reopening, retained shear baseline, invalid-input preservation, and printable evidence content.

Fresh real-browser visual, offline-runtime, installability, and print-layout acceptance remain separate gates. See the latest dated section in [the PWA record](pwa-v1.md).
