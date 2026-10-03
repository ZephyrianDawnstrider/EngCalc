import {
  calculateShearIntermediates,
  calculateShearResult,
  type CalculationReport,
  type ShearInputs,
} from "./core/calculator";

export const HISTORY_STORAGE_KEY = "engcalc.report-history.v1";
export const HISTORY_STORAGE_VERSION = 1;
export const MAX_HISTORY_REPORTS = 50;
export const MAX_HISTORY_BYTES = 1_000_000;

export type StorageLike = Pick<Storage, "getItem" | "setItem">;
export type HistoryState = "ready" | "unavailable" | "corrupt" | "unsupported";

export interface HistoryRead {
  reports: CalculationReport[];
  state: HistoryState;
  message: string;
}

export type RawHistoryRead = { ok: true; raw: string } | { ok: false; message: string };

export type HistorySave =
  | { ok: true; reports: CalculationReport[]; alreadySaved: boolean }
  | { ok: false; reports: CalculationReport[]; state: HistoryState | "full" | "quota"; message: string };

const emptyHistory = (state: HistoryState = "ready", message = ""): HistoryRead => ({
  reports: [],
  state,
  message,
});

const EXPECTED_FORMULA = {
  shear_yield_strength: "tau_y = Fy / sqrt(3)",
  shank_area: "A = pi * d^2 / 4",
  total_nominal_yield_capacity: "C = tau_y * A * n",
  factored_demand: "D = V * FF",
  margin_of_safety: "MS = C / D - 1",
  unit_note: "MPa = N/mm^2, so strength (MPa) times area (mm^2) gives force (N).",
};
const EXPECTED_ASSUMPTIONS = [
  "Static, concentric, pure shear on the bolt shank.",
  "Ductile, isotropic material; user-provided tensile yield strength represents the same material and condition.",
  "The full circular, unthreaded shank area carries the load at each shear plane.",
  "Shear planes share the factored applied load equally.",
  "The load factor is user-selected and multiplies the applied shear load.",
];
const EXPECTED_LIMITATIONS = [
  "This is an educational idealized yield estimate, not an allowable, safety certification, or design approval.",
  "It does not check ultimate failure, thread shear, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading.",
  "Do not use the full-shank area if a thread crosses the shear plane.",
  "Choose and verify material properties, load factor, geometry, and all omitted failure modes for the actual application.",
];

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isQuantity(value: unknown, unit: string): boolean {
  return isRecord(value) && isFiniteNumber(value.value) && value.unit === unit;
}

function isCloseAtModelTolerance(actual: number, expected: number, tolerance: number): boolean {
  if (Object.is(actual, expected)) return true;
  const scale = Math.max(Math.abs(actual), Math.abs(expected));
  return scale > 0 && Math.abs(actual - expected) <= tolerance * scale;
}

function resultMatchesInputs(report: CalculationReport): boolean {
  const inputs: ShearInputs = {
    tensile_yield_strength_MPa: report.inputs.tensile_yield_strength.value,
    diameter_mm: report.inputs.shank_diameter.value,
    applied_shear_N: report.inputs.applied_shear_load.value,
    shear_planes: report.inputs.shear_planes.value,
    fitting_factor: report.inputs.load_factor.value,
  };
  try {
    const expected = calculateShearResult(inputs);
    const expectedIntermediates = calculateShearIntermediates(inputs);
    const actual = report.result;
    const tolerance = report.result.boundary_relative_tolerance;
    const actualIntermediates = report.intermediates;
    const intermediatesMatch = (
      key: keyof CalculationReport["intermediates"],
    ) => actualIntermediates[key].unit === expectedIntermediates[key].unit &&
      isCloseAtModelTolerance(actualIntermediates[key].value, expectedIntermediates[key].value, tolerance);
    return actual.status === expected.status &&
      actual.boundary_relative_tolerance === expected.boundary_relative_tolerance &&
      isCloseAtModelTolerance(actual.total_nominal_yield_capacity_N, expected.total_nominal_yield_capacity_N, tolerance) &&
      isCloseAtModelTolerance(actual.factored_applied_load_N, expected.factored_applied_load_N, tolerance) &&
      isCloseAtModelTolerance(actual.margin_of_safety, expected.margin_of_safety, tolerance) &&
      intermediatesMatch("von_mises_shear_yield_strength") &&
      intermediatesMatch("full_circular_shank_area") &&
      intermediatesMatch("nominal_yield_capacity_per_plane") &&
      intermediatesMatch("factored_applied_load_per_plane");
  } catch {
    return false;
  }
}

/** Strictly accepts report v1 snapshots this UI knows how to render. */
export function isSupportedReport(value: unknown): value is CalculationReport {
  if (!isRecord(value)) return false;
  const topLevelKeys = ["report_id", "report_schema_version", "calculator_version", "created_at", "model", "inputs", "formula", "intermediates", "result", "assumptions", "limitations", "formula_source"];
  if (Object.keys(value).length !== topLevelKeys.length || !topLevelKeys.every((key) => key in value)) return false;
  if (
    typeof value.report_id !== "string" || value.report_id.length < 1 || value.report_id.length > 80 ||
    value.report_schema_version !== "1.0" || value.calculator_version !== "1.0.0" ||
    typeof value.created_at !== "string" || !Number.isFinite(Date.parse(value.created_at))
  ) return false;

  const model = value.model;
  const inputs = value.inputs;
  const formula = value.formula;
  const intermediates = value.intermediates;
  const result = value.result;
  const source = value.formula_source;
  if (
    !isRecord(model) || model.id !== "von-mises-pure-shear-yield-v1" ||
    model.name !== "Idealized von Mises bolt-shank shear yield" ||
    model.purpose !== "Educational estimate of nominal yield load under stated assumptions"
  ) return false;
  if (!isRecord(inputs) || !isRecord(formula) || !isRecord(intermediates) || !isRecord(result) || !isRecord(source)) return false;
  if (
    !isQuantity(inputs.tensile_yield_strength, "MPa") || !isQuantity(inputs.shank_diameter, "mm") ||
    !isQuantity(inputs.applied_shear_load, "N") || !isQuantity(inputs.shear_planes, "count") ||
    !isQuantity(inputs.load_factor, "dimensionless")
  ) return false;
  if (Object.keys(formula).length !== Object.keys(EXPECTED_FORMULA).length) return false;
  if (!Object.entries(EXPECTED_FORMULA).every(([key, expected]) => formula[key] === expected)) return false;
  if (
    !isRecord(inputs.tensile_yield_strength) ||
    inputs.tensile_yield_strength.note !== "User supplied; not checked against a material or fastener specification."
  ) return false;
  const tensileYield = (inputs.tensile_yield_strength as { value: number }).value;
  const diameter = (inputs.shank_diameter as { value: number }).value;
  const appliedLoad = (inputs.applied_shear_load as { value: number }).value;
  const planes = (inputs.shear_planes as { value: number }).value;
  const loadFactor = (inputs.load_factor as { value: number }).value;
  if (tensileYield <= 0 || diameter <= 0 || appliedLoad <= 0 || ![1, 2].includes(planes) || !Number.isInteger(planes) || loadFactor < 1) return false;
  if (
    !isQuantity(intermediates.von_mises_shear_yield_strength, "MPa") ||
    !isQuantity(intermediates.full_circular_shank_area, "mm^2") ||
    !isQuantity(intermediates.nominal_yield_capacity_per_plane, "N") ||
    !isQuantity(intermediates.factored_applied_load_per_plane, "N")
  ) return false;
  if (
    (intermediates.von_mises_shear_yield_strength as { value: number }).value <= 0 ||
    (intermediates.full_circular_shank_area as { value: number }).value <= 0 ||
    (intermediates.nominal_yield_capacity_per_plane as { value: number }).value <= 0 ||
    (intermediates.factored_applied_load_per_plane as { value: number }).value <= 0
  ) return false;
  if (
    !isFiniteNumber(result.total_nominal_yield_capacity_N) || !isFiniteNumber(result.factored_applied_load_N) ||
    !isFiniteNumber(result.margin_of_safety) || !isFiniteNumber(result.boundary_relative_tolerance) ||
    !["WITHIN_MODELED_YIELD", "AT_MODELED_YIELD", "ABOVE_MODELED_YIELD"].includes(String(result.status))
  ) return false;
  if (
    (result.total_nominal_yield_capacity_N as number) <= 0 ||
    (result.factored_applied_load_N as number) <= 0 ||
    result.boundary_relative_tolerance !== 1e-12
  ) return false;
  if (JSON.stringify(value.assumptions) !== JSON.stringify(EXPECTED_ASSUMPTIONS)) return false;
  if (JSON.stringify(value.limitations) !== JSON.stringify(EXPECTED_LIMITATIONS)) return false;
  if (
    source.author !== "David Roylance, MIT Department of Materials Science and Engineering" ||
    source.title !== "Yield and Plastic Flow" ||
    source.location !== "Printed page 5 (PDF page 5), pure-shear von Mises yield derivation" ||
    source.url !== "https://web.mit.edu/course/3/3.11/www/modules/yield.pdf"
  ) return false;
  return resultMatchesInputs(value as unknown as CalculationReport);
}

function parseEnvelope(raw: string | null): HistoryRead {
  if (raw === null) return emptyHistory();
  if (new TextEncoder().encode(raw).byteLength > MAX_HISTORY_BYTES) {
    return emptyHistory("corrupt", "Saved history is larger than this app can safely read. Its stored data was left untouched.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return emptyHistory("corrupt", "Saved history could not be read. Its stored data was left untouched.");
  }
  if (!isRecord(parsed) || typeof parsed.storage_schema_version !== "number") {
    return emptyHistory("corrupt", "Saved history has an invalid structure. Its stored data was left untouched.");
  }
  if (parsed.storage_schema_version !== HISTORY_STORAGE_VERSION) {
    return emptyHistory("unsupported", "Saved history uses a storage version this app does not support. Its stored data was left untouched.");
  }
  if (!Array.isArray(parsed.reports)) {
    return emptyHistory("corrupt", "Saved history has an invalid report list. Its stored data was left untouched.");
  }
  if (parsed.reports.length > MAX_HISTORY_REPORTS) {
    return emptyHistory("corrupt", "Saved history exceeds this app's supported capacity. Its stored data was left untouched.");
  }

  const reports: CalculationReport[] = [];
  const seen = new Set<string>();
  for (const item of parsed.reports) {
    if (!isSupportedReport(item) || seen.has(item.report_id)) {
      return emptyHistory("corrupt", "Saved history contains a malformed or duplicate report. Its stored data was left untouched.");
    }
    seen.add(item.report_id);
    reports.push(item);
  }
  return { reports, state: "ready", message: "" };
}

export function readHistory(storage: StorageLike | null = browserStorage()): HistoryRead {
  if (!storage) return emptyHistory("unavailable", "This browser does not allow local history storage. You can still calculate, export, and print reports.");
  try {
    return parseEnvelope(storage.getItem(HISTORY_STORAGE_KEY));
  } catch {
    return emptyHistory("unavailable", "Local history could not be accessed. You can still calculate, export, and print reports.");
  }
}

export function readStoredHistoryRaw(storage: StorageLike | null = browserStorage()): RawHistoryRead {
  if (!storage) return { ok: false, message: "Browser history storage is unavailable." };
  try {
    const raw = storage.getItem(HISTORY_STORAGE_KEY);
    return raw === null
      ? { ok: false, message: "There is no raw history record to export." }
      : { ok: true, raw };
  } catch {
    return { ok: false, message: "Browser history storage could not be read for recovery." };
  }
}

export function saveReport(
  report: CalculationReport,
  storage: StorageLike | null = browserStorage(),
): HistorySave {
  if (!isSupportedReport(report)) {
    return { ok: false, reports: [], state: "corrupt", message: "This report does not match the supported v1 snapshot format, so it was not saved." };
  }
  if (!storage) {
    return { ok: false, reports: [], state: "unavailable", message: "Local history is unavailable. This report is still available to export or print." };
  }

  let raw: string | null;
  let current: HistoryRead;
  try {
    raw = storage.getItem(HISTORY_STORAGE_KEY);
    current = parseEnvelope(raw);
  } catch {
    return { ok: false, reports: [], state: "unavailable", message: "Local history could not be accessed. This report is still available to export or print." };
  }
  if (current.state !== "ready") {
    return { ok: false, reports: current.reports, state: current.state, message: current.message };
  }

  const duplicate = current.reports.find((item) => item.report_id === report.report_id);
  if (duplicate) {
    if (JSON.stringify(duplicate) === JSON.stringify(report)) {
      return { ok: true, reports: current.reports, alreadySaved: true };
    }
    return { ok: false, reports: current.reports, state: "corrupt", message: "A different saved report already uses this report ID. Existing history was left unchanged." };
  }
  if (current.reports.length >= MAX_HISTORY_REPORTS) {
    return { ok: false, reports: current.reports, state: "full", message: `History is at its ${MAX_HISTORY_REPORTS}-report limit. No saved reports were removed; export this report before managing browser storage.` };
  }

  const reports = [report, ...current.reports];
  const serialized = JSON.stringify({ storage_schema_version: HISTORY_STORAGE_VERSION, reports });
  if (new TextEncoder().encode(serialized).byteLength > MAX_HISTORY_BYTES) {
    return { ok: false, reports: current.reports, state: "full", message: "History reached its storage-size limit. No saved reports were removed; this report is still available to export or print." };
  }
  try {
    storage.setItem(HISTORY_STORAGE_KEY, serialized);
    if (storage.getItem(HISTORY_STORAGE_KEY) !== serialized) throw new Error("Storage did not retain the saved snapshot");
    return { ok: true, reports, alreadySaved: false };
  } catch {
    return { ok: false, reports: current.reports, state: "quota", message: "Browser storage could not save this report (it may be full or blocked). Existing history was kept; this report is still available to export or print." };
  }
}
