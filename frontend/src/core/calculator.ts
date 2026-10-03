export type ShearInputs = {
  tensile_yield_strength_MPa: number;
  diameter_mm: number;
  applied_shear_N: number;
  shear_planes?: number;
  fitting_factor?: number;
};

type Quantity = { value: number; unit: string };

export type CalculationReport = {
  report_id: string;
  report_schema_version: "1.0";
  calculator_version: "1.0.0";
  created_at: string;
  model: { id: string; name: string; purpose: string };
  inputs: {
    tensile_yield_strength: Quantity & { note: string };
    shank_diameter: Quantity;
    applied_shear_load: Quantity;
    shear_planes: Quantity;
    load_factor: Quantity;
  };
  formula: {
    shear_yield_strength: string;
    shank_area: string;
    total_nominal_yield_capacity: string;
    factored_demand: string;
    margin_of_safety: string;
    unit_note: string;
  };
  intermediates: {
    von_mises_shear_yield_strength: Quantity;
    full_circular_shank_area: Quantity;
    nominal_yield_capacity_per_plane: Quantity;
    factored_applied_load_per_plane: Quantity;
  };
  result: {
    total_nominal_yield_capacity_N: number;
    factored_applied_load_N: number;
    margin_of_safety: number;
    status: "WITHIN_MODELED_YIELD" | "AT_MODELED_YIELD" | "ABOVE_MODELED_YIELD";
    boundary_relative_tolerance: number;
  };
  assumptions: string[];
  limitations: string[];
  formula_source: { title: string; author: string; url: string; location: string };
};

const CALCULATOR_VERSION = "1.0.0" as const;
const REPORT_SCHEMA_VERSION = "1.0" as const;
const MODEL_ID = "von-mises-pure-shear-yield-v1";
const BOUNDARY_RELATIVE_TOLERANCE = 1e-12;

const ASSUMPTIONS = [
  "Static, concentric, pure shear on the bolt shank.",
  "Ductile, isotropic material; user-provided tensile yield strength represents the same material and condition.",
  "The full circular, unthreaded shank area carries the load at each shear plane.",
  "Shear planes share the factored applied load equally.",
  "The load factor is user-selected and multiplies the applied shear load.",
];

const LIMITATIONS = [
  "This is an educational idealized yield estimate, not an allowable, safety certification, or design approval.",
  "It does not check ultimate failure, thread shear, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading.",
  "Do not use the full-shank area if a thread crosses the shear plane.",
  "Choose and verify material properties, load factor, geometry, and all omitted failure modes for the actual application.",
];

const FORMULA_SOURCE = {
  title: "Yield and Plastic Flow",
  author: "David Roylance, MIT Department of Materials Science and Engineering",
  url: "https://web.mit.edu/course/3/3.11/www/modules/yield.pdf",
  location: "Printed page 5 (PDF page 5), pure-shear von Mises yield derivation",
};

const FORMULA_REPORT = {
  shear_yield_strength: "tau_y = Fy / sqrt(3)",
  shank_area: "A = pi * d^2 / 4",
  total_nominal_yield_capacity: "C = tau_y * A * n",
  factored_demand: "D = V * FF",
  margin_of_safety: "MS = C / D - 1",
  unit_note: "MPa = N/mm^2, so strength (MPa) times area (mm^2) gives force (N).",
};

const INPUT_KEYS = new Set([
  "tensile_yield_strength_MPa",
  "diameter_mm",
  "applied_shear_N",
  "shear_planes",
  "fitting_factor",
]);

function positiveFinite(name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new TypeError(`${name} must be a finite positive number`);
  }
  return value;
}

function validateInputs(inputs: ShearInputs): {
  fy: number;
  diameter: number;
  applied: number;
  planes: number;
  factor: number;
} {
  if (typeof inputs !== "object" || inputs === null || Array.isArray(inputs)) {
    throw new TypeError("inputs must be a JSON object");
  }
  for (const key of Object.keys(inputs)) {
    if (!INPUT_KEYS.has(key)) throw new TypeError(`unknown input field: ${key}`);
  }
  for (const key of [
    "tensile_yield_strength_MPa",
    "diameter_mm",
    "applied_shear_N",
  ] as const) {
    if (!Object.prototype.hasOwnProperty.call(inputs, key)) {
      throw new TypeError(`${key} is required`);
    }
  }

  const fy = positiveFinite(
    "tensile_yield_strength_MPa",
    inputs.tensile_yield_strength_MPa,
  );
  const diameter = positiveFinite("diameter_mm", inputs.diameter_mm);
  const applied = positiveFinite("applied_shear_N", inputs.applied_shear_N);
  const factorValue = Object.prototype.hasOwnProperty.call(inputs, "fitting_factor")
    ? inputs.fitting_factor
    : 1.0;
  const factor = positiveFinite("fitting_factor", factorValue);
  if (factor < 1.0) throw new RangeError("fitting_factor must be at least 1.0");

  const planes = Object.prototype.hasOwnProperty.call(inputs, "shear_planes")
    ? inputs.shear_planes
    : 1;
  if (typeof planes !== "number" || !Number.isInteger(planes) || (planes !== 1 && planes !== 2)) {
    throw new TypeError("shear_planes must be the integer 1 or 2");
  }
  return { fy, diameter, applied, planes, factor };
}

function calculate(inputs: ShearInputs) {
  const { fy, diameter, applied, planes, factor } = validateInputs(inputs);
  const area = Math.PI * (diameter / 2) ** 2;
  const shearYield = fy / Math.sqrt(3);
  const capacityPerPlane = shearYield * area;
  const totalCapacity = capacityPerPlane * planes;
  const factoredLoad = applied * factor;
  const loadPerPlane = factoredLoad / planes;

  const derived = {
    bolt_area_mm2: area,
    shear_yield_strength_MPa: shearYield,
    nominal_yield_capacity_per_plane_N: capacityPerPlane,
    total_nominal_yield_capacity_N: totalCapacity,
    factored_applied_load_N: factoredLoad,
    applied_load_per_plane_N: loadPerPlane,
  };
  if (Object.values(derived).some((value) => !Number.isFinite(value))) {
    throw new RangeError("Inputs are outside the calculator's finite numeric range");
  }
  if (Object.values(derived).some((value) => value <= 0)) {
    throw new RangeError("Inputs produce a zero or non-positive derived value");
  }

  let margin = totalCapacity / factoredLoad - 1;
  if (!Number.isFinite(margin)) {
    throw new RangeError("Inputs produce a margin outside the calculator's finite numeric range");
  }
  const onBoundary =
    Math.abs(totalCapacity - factoredLoad) <=
    BOUNDARY_RELATIVE_TOLERANCE * Math.max(Math.abs(totalCapacity), Math.abs(factoredLoad));
  let status: CalculationReport["result"]["status"];
  if (onBoundary) {
    status = "AT_MODELED_YIELD";
    margin = 0;
  } else if (margin > 0) {
    status = "WITHIN_MODELED_YIELD";
  } else {
    status = "ABOVE_MODELED_YIELD";
  }

  return {
    fy,
    diameter,
    applied,
    planes,
    factor,
    ...derived,
    margin_of_safety: margin,
    status,
  };
}

function resultFromCalculation(calculation: ReturnType<typeof calculate>): CalculationReport["result"] {
  return {
    total_nominal_yield_capacity_N: calculation.total_nominal_yield_capacity_N,
    factored_applied_load_N: calculation.factored_applied_load_N,
    margin_of_safety: calculation.margin_of_safety,
    status: calculation.status,
    boundary_relative_tolerance: BOUNDARY_RELATIVE_TOLERANCE,
  };
}

function intermediatesFromCalculation(
  calculation: ReturnType<typeof calculate>,
): CalculationReport["intermediates"] {
  return {
    von_mises_shear_yield_strength: {
      value: calculation.shear_yield_strength_MPa,
      unit: "MPa",
    },
    full_circular_shank_area: { value: calculation.bolt_area_mm2, unit: "mm^2" },
    nominal_yield_capacity_per_plane: {
      value: calculation.nominal_yield_capacity_per_plane_N,
      unit: "N",
    },
    factored_applied_load_per_plane: {
      value: calculation.applied_load_per_plane_N,
      unit: "N",
    },
  };
}

export function calculateShearResult(inputs: ShearInputs): CalculationReport["result"] {
  return resultFromCalculation(calculate(inputs));
}

export function calculateShearIntermediates(
  inputs: ShearInputs,
): CalculationReport["intermediates"] {
  return intermediatesFromCalculation(calculate(inputs));
}

export function buildReport(inputs: ShearInputs): CalculationReport {
  const calculation = calculate(inputs);
  return {
    report_id: globalThis.crypto.randomUUID(),
    report_schema_version: REPORT_SCHEMA_VERSION,
    calculator_version: CALCULATOR_VERSION,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, "+00:00"),
    model: {
      id: MODEL_ID,
      name: "Idealized von Mises bolt-shank shear yield",
      purpose: "Educational estimate of nominal yield load under stated assumptions",
    },
    inputs: {
      tensile_yield_strength: {
        value: calculation.fy,
        unit: "MPa",
        note: "User supplied; not checked against a material or fastener specification.",
      },
      shank_diameter: { value: calculation.diameter, unit: "mm" },
      applied_shear_load: { value: calculation.applied, unit: "N" },
      shear_planes: { value: calculation.planes, unit: "count" },
      load_factor: { value: calculation.factor, unit: "dimensionless" },
    },
    formula: { ...FORMULA_REPORT },
    intermediates: intermediatesFromCalculation(calculation),
    result: resultFromCalculation(calculation),
    assumptions: [...ASSUMPTIONS],
    limitations: [...LIMITATIONS],
    formula_source: { ...FORMULA_SOURCE },
  };
}
