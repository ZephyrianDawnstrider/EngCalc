import { describe, expect, it } from "vitest";
import { calculateShearIntermediates, calculateShearResult, type CalculationReport } from "../src/core/calculator";
import {
  HISTORY_STORAGE_KEY,
  HISTORY_STORAGE_VERSION,
  MAX_HISTORY_REPORTS,
  readHistory,
  readStoredHistoryRaw,
  saveReport,
  type StorageLike,
} from "../src/history";

class MemoryStorage implements StorageLike {
  values = new Map<string, string>();
  failRead = false;
  failWrite = false;

  getItem(key: string): string | null {
    if (this.failRead) throw new DOMException("Blocked", "SecurityError");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    if (this.failWrite) throw new DOMException("Storage full", "QuotaExceededError");
    this.values.set(key, value);
  }
}

function makeReport(id = "report-1"): CalculationReport {
  const inputs = {
    tensile_yield_strength_MPa: 640,
    diameter_mm: 8,
    applied_shear_N: 10000,
    shear_planes: 1,
    fitting_factor: 1,
  };
  const result = calculateShearResult(inputs);
  const intermediates = calculateShearIntermediates(inputs);
  return {
    report_id: id,
    report_schema_version: "1.0",
    calculator_version: "1.0.0",
    created_at: "2026-10-03T10:00:00+00:00",
    model: {
      id: "von-mises-pure-shear-yield-v1",
      name: "Idealized von Mises bolt-shank shear yield",
      purpose: "Educational estimate of nominal yield load under stated assumptions",
    },
    inputs: {
      tensile_yield_strength: { value: 640, unit: "MPa", note: "User supplied; not checked against a material or fastener specification." },
      shank_diameter: { value: 8, unit: "mm" },
      applied_shear_load: { value: 10000, unit: "N" },
      shear_planes: { value: 1, unit: "count" },
      load_factor: { value: 1, unit: "dimensionless" },
    },
    formula: {
      shear_yield_strength: "tau_y = Fy / sqrt(3)",
      shank_area: "A = pi * d^2 / 4",
      total_nominal_yield_capacity: "C = tau_y * A * n",
      factored_demand: "D = V * FF",
      margin_of_safety: "MS = C / D - 1",
      unit_note: "MPa = N/mm^2, so strength (MPa) times area (mm^2) gives force (N).",
    },
    intermediates,
    result,
    assumptions: [
      "Static, concentric, pure shear on the bolt shank.",
      "Ductile, isotropic material; user-provided tensile yield strength represents the same material and condition.",
      "The full circular, unthreaded shank area carries the load at each shear plane.",
      "Shear planes share the factored applied load equally.",
      "The load factor is user-selected and multiplies the applied shear load.",
    ],
    limitations: [
      "This is an educational idealized yield estimate, not an allowable, safety certification, or design approval.",
      "It does not check ultimate failure, thread shear, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading.",
      "Do not use the full-shank area if a thread crosses the shear plane.",
      "Choose and verify material properties, load factor, geometry, and all omitted failure modes for the actual application.",
    ],
    formula_source: {
      title: "Yield and Plastic Flow",
      author: "David Roylance, MIT Department of Materials Science and Engineering",
      url: "https://web.mit.edu/course/3/3.11/www/modules/yield.pdf",
      location: "Printed page 5 (PDF page 5), pure-shear von Mises yield derivation",
    },
  };
}

describe("device-local report history", () => {
  it("starts empty and round-trips immutable v1 snapshots", () => {
    const storage = new MemoryStorage();
    expect(readHistory(storage)).toMatchObject({ reports: [], state: "ready" });

    const report = makeReport();
    const saved = saveReport(report, storage);

    expect(saved).toMatchObject({ ok: true, reports: [report], alreadySaved: false });
    expect(JSON.parse(storage.getItem(HISTORY_STORAGE_KEY) ?? "")).toEqual({
      storage_schema_version: HISTORY_STORAGE_VERSION,
      reports: [report],
    });
    expect(readHistory(storage).reports[0]).toEqual(report);
    expect(saveReport(report, storage)).toMatchObject({ ok: true, alreadySaved: true });
  });

  it("keeps malformed raw data untouched and refuses to overwrite it", () => {
    const storage = new MemoryStorage();
    const raw = "{not-json";
    storage.values.set(HISTORY_STORAGE_KEY, raw);

    expect(readHistory(storage).state).toBe("corrupt");
    const save = saveReport(makeReport(), storage);
    expect(save.ok).toBe(false);
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
    expect(readStoredHistoryRaw(storage)).toEqual({ ok: true, raw });
  });

  it("keeps unsupported storage versions untouched", () => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ storage_schema_version: 2, reports: [] });
    storage.values.set(HISTORY_STORAGE_KEY, raw);

    expect(readHistory(storage).state).toBe("unsupported");
    expect(saveReport(makeReport(), storage)).toMatchObject({ ok: false, state: "unsupported" });
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
  });

  it("does not evict existing reports when the count limit is reached", () => {
    const storage = new MemoryStorage();
    const reports = Array.from({ length: MAX_HISTORY_REPORTS }, (_, index) => makeReport(`report-${index}`));
    const raw = JSON.stringify({ storage_schema_version: HISTORY_STORAGE_VERSION, reports });
    storage.values.set(HISTORY_STORAGE_KEY, raw);

    const save = saveReport(makeReport("one-more"), storage);
    expect(save).toMatchObject({ ok: false, state: "full", reports });
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
  });

  it("keeps existing snapshots when storage rejects a write", () => {
    const storage = new MemoryStorage();
    const original = makeReport("original");
    const raw = JSON.stringify({ storage_schema_version: HISTORY_STORAGE_VERSION, reports: [original] });
    storage.values.set(HISTORY_STORAGE_KEY, raw);
    storage.failWrite = true;

    expect(saveReport(makeReport("new-report"), storage)).toMatchObject({ ok: false, state: "quota", reports: [original] });
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
  });

  it("reports blocked reads without throwing", () => {
    const storage = new MemoryStorage();
    storage.failRead = true;

    expect(readHistory(storage)).toMatchObject({ state: "unavailable", reports: [] });
    expect(saveReport(makeReport(), storage)).toMatchObject({ ok: false, state: "unavailable" });
  });

  it("rejects unsupported report snapshots without writing", () => {
    const storage = new MemoryStorage();
    const invalid = { ...makeReport(), calculator_version: "2.0.0" } as unknown as CalculationReport;

    expect(saveReport(invalid, storage)).toMatchObject({ ok: false, state: "corrupt" });
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ["missing formula", (report: CalculationReport) => ({ ...report, formula: {} })],
    ["nonpositive tensile yield", (report: CalculationReport) => ({ ...report, inputs: { ...report.inputs, tensile_yield_strength: { ...report.inputs.tensile_yield_strength, value: 0 } } })],
    ["invalid plane count", (report: CalculationReport) => ({ ...report, inputs: { ...report.inputs, shear_planes: { ...report.inputs.shear_planes, value: 3 } } })],
    ["wrong source URL", (report: CalculationReport) => ({ ...report, formula_source: { ...report.formula_source, url: "javascript:alert(1)" } })],
  ])("rejects malformed v1 snapshots (%s) without writing", (_label, corrupt) => {
    const storage = new MemoryStorage();
    const raw = JSON.stringify({ storage_schema_version: HISTORY_STORAGE_VERSION, reports: [makeReport()] });
    storage.values.set(HISTORY_STORAGE_KEY, raw);
    const invalid = corrupt(makeReport()) as CalculationReport;

    expect(saveReport(invalid, storage)).toMatchObject({ ok: false, state: "corrupt" });
    expect(readHistory(storage).state).toBe("ready");
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
  });

  it.each([
    ["capacity", (report: CalculationReport) => ({ ...report, result: { ...report.result, total_nominal_yield_capacity_N: report.result.total_nominal_yield_capacity_N * 1.01 } })],
    ["status", (report: CalculationReport) => ({ ...report, result: { ...report.result, status: "ABOVE_MODELED_YIELD" as const } })],
    ["margin", (report: CalculationReport) => ({ ...report, result: { ...report.result, margin_of_safety: report.result.margin_of_safety + 0.01 } })],
    ["intermediate", (report: CalculationReport) => ({ ...report, intermediates: { ...report.intermediates, full_circular_shank_area: { ...report.intermediates.full_circular_shank_area, value: report.intermediates.full_circular_shank_area.value * 1.01 } } })],
  ])("rejects a persisted report with altered %s and preserves its original JSON", (_label, alter) => {
    const storage = new MemoryStorage();
    const inconsistent = alter(makeReport()) as CalculationReport;
    const raw = JSON.stringify({ storage_schema_version: HISTORY_STORAGE_VERSION, reports: [inconsistent] });
    storage.values.set(HISTORY_STORAGE_KEY, raw);

    expect(readHistory(storage)).toMatchObject({ state: "corrupt", reports: [] });
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
    expect(saveReport(makeReport("new"), storage)).toMatchObject({ ok: false, state: "corrupt" });
    expect(storage.getItem(HISTORY_STORAGE_KEY)).toBe(raw);
  });
});
