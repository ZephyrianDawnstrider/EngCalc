export interface AxialInputs {
  tensile_yield_strength_MPa: number;
  diameter_mm: number;
  axial_force_N: number;
  load_factor: number;
}

export const AXIAL_MODEL_ID = "uniform-round-shank-axial-yield-v1";
export const AXIAL_SCHEMA = "axial-yield/1.0";
export const AXIAL_VERSION = "1.0.0";
export const AXIAL_TOLERANCE = 1e-12;
export const AXIAL_EXAMPLE: AxialInputs = {
  tensile_yield_strength_MPa: 640,
  diameter_mm: 8,
  axial_force_N: 10000,
  load_factor: 1.25,
};
const INPUT_KEYS = Object.keys(AXIAL_EXAMPLE);

export const AXIAL_ASSUMPTIONS = [
  "Static, concentric axial tension of a straight, smooth, solid circular shank of constant original diameter.",
  "Uniform axial engineering stress over the original cross-sectional area, away from load-introduction effects.",
  "Homogeneous ductile material; the supplied tensile yield strength applies to the material and condition being evaluated.",
  "The entered force is the axial tensile force carried by this member section before the user-selected load factor.",
  "The load factor is a user-selected multiplier, not a prescribed code factor or verified safety factor.",
] as const;
export const AXIAL_LIMITATIONS = [
  "Educational nominal yield estimate only; not a code design check, design allowable, safety certification, or approval.",
  "The supplied yield convention may be an offset/proof value; the model does not locate the exact onset of plasticity.",
  "No threads, reduced tensile-stress area, holes, notches, stress concentrations, necking, ultimate strength, or fracture.",
  "No compression or buckling, bending, eccentricity, torsion, shear interaction, fatigue, impact, thermal stress, or creep.",
  "No bolt preload, joint stiffness or separation, prying, or load sharing; an external joint load is not automatically the force in a bolt.",
  "Verify all properties and loads and assess every relevant failure mode for the actual application with a qualified engineer.",
] as const;
export const AXIAL_FORMULA = {
  original_area: "A0 = pi * d^2 / 4",
  factored_demand: "D = P * LF",
  engineering_stress: "sigma = D / A0",
  nominal_yield_load: "Py = Fy * A0 (derived by setting sigma = Fy)",
  demand_ratio: "U = D / Py",
  model_margin: "M = Py / D - 1",
  units:
    "MPa = N/mm^2; force in N and original area in mm^2 give engineering stress in MPa.",
} as const;
export const AXIAL_SOURCE = {
  author: "David Roylance, MIT Department of Materials Science and Engineering",
  title: "Stress-Strain Curves",
  url: "https://web.mit.edu/course/3/3.11/www/modules/ss.pdf",
  location:
    "Printed/PDF page 1, Eq. (1): engineering stress; page 3: yield stress and offset convention",
  derivation:
    "Nominal yield load Fy*A0 follows by equating engineering stress P/A0 to the user-supplied Fy. The factor and margin are explicit EngCalc conventions, not code provisions.",
} as const;

export function calculateAxial(inputs: AxialInputs) {
  if (!inputs || typeof inputs !== "object" || Array.isArray(inputs))
    throw new TypeError("Inputs must be an object.");
  if (
    Object.keys(inputs).length !== INPUT_KEYS.length ||
    Object.keys(inputs).some((key) => !INPUT_KEYS.includes(key))
  )
    throw new TypeError("Exactly the four axial-model inputs are required.");
  for (const key of INPUT_KEYS as (keyof AxialInputs)[]) {
    if (
      typeof inputs[key] !== "number" ||
      !Number.isFinite(inputs[key]) ||
      inputs[key] <= 0
    )
      throw new RangeError(
        "Yield strength, diameter, axial force, and load factor must be finite positive numbers.",
      );
  }
  if (inputs.load_factor < 1)
    throw new RangeError("Load factor must be at least 1.0.");
  const original_area_mm2 = Math.PI * (inputs.diameter_mm / 2) ** 2;
  const factored_demand_N = inputs.axial_force_N * inputs.load_factor;
  const engineering_stress_MPa = factored_demand_N / original_area_mm2;
  const nominal_yield_load_N =
    inputs.tensile_yield_strength_MPa * original_area_mm2;
  const demand_ratio = factored_demand_N / nominal_yield_load_N;
  const results = {
    original_area_mm2,
    factored_demand_N,
    engineering_stress_MPa,
    nominal_yield_load_N,
    demand_ratio,
  };
  if (
    Object.values(results).some(
      (value) => !Number.isFinite(value) || value <= 0,
    )
  )
    throw new RangeError(
      "Inputs produce a result outside the supported finite numeric range.",
    );
  let model_margin = nominal_yield_load_N / factored_demand_N - 1;
  if (!Number.isFinite(model_margin))
    throw new RangeError(
      "Inputs produce a margin outside the supported finite numeric range.",
    );
  const onBoundary =
    Math.abs(nominal_yield_load_N - factored_demand_N) <=
    AXIAL_TOLERANCE * Math.max(nominal_yield_load_N, factored_demand_N);
  const status = onBoundary
    ? "AT_MODELED_YIELD"
    : model_margin > 0
      ? "WITHIN_MODELED_YIELD"
      : "ABOVE_MODELED_YIELD";
  if (onBoundary) model_margin = 0;
  return {
    ...results,
    model_margin,
    status,
    boundary_relative_tolerance: AXIAL_TOLERANCE,
  };
}

export function buildAxialReport(
  inputs: AxialInputs,
  identity = {
    report_id: crypto.randomUUID() as string,
    created_at: new Date().toISOString(),
  },
) {
  const result = calculateAxial(inputs);
  return {
    report_id: identity.report_id,
    created_at: identity.created_at,
    report_schema_version: AXIAL_SCHEMA,
    calculator_version: AXIAL_VERSION,
    model: {
      id: AXIAL_MODEL_ID,
      name: "Uniform round-shank axial tensile yield",
      purpose: "Educational estimate of nominal yield under stated assumptions",
    },
    inputs: { ...inputs },
    units: {
      tensile_yield_strength_MPa: "MPa",
      diameter_mm: "mm",
      axial_force_N: "N",
      load_factor: "dimensionless",
      original_area_mm2: "mm^2",
      factored_demand_N: "N",
      engineering_stress_MPa: "MPa",
      nominal_yield_load_N: "N",
      demand_ratio: "dimensionless",
      model_margin: "dimensionless",
    },
    result,
    formula: { ...AXIAL_FORMULA },
    assumptions: [...AXIAL_ASSUMPTIONS],
    limitations: [...AXIAL_LIMITATIONS],
    formula_source: { ...AXIAL_SOURCE },
  };
}
export type AxialReport = ReturnType<typeof buildAxialReport>;
