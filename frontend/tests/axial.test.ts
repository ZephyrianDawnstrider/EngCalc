import { describe, expect, it } from "vitest";
import {
  AXIAL_EXAMPLE,
  AXIAL_SCHEMA,
  buildAxialReport,
  calculateAxial,
  type AxialInputs,
} from "../src/core/axialCalculator";
import { buildReport } from "../src/core/calculator";
import {
  AXIAL_HISTORY_KEY,
  isAxialReport,
  readAxialHistory,
  saveAxialReport,
} from "../src/axialHistory";
import {
  HISTORY_STORAGE_KEY,
  readHistory,
  saveReport,
  type StorageLike,
} from "../src/history";

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  failRead = false;
  failWrite = false;
  getItem(key: string) {
    if (this.failRead) throw Error("blocked");
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    if (this.failWrite) throw Error("quota");
    this.data.set(key, value);
  }
}
describe("educational round-shank axial yield", () => {
  it("matches independently computed 45-digit decimal hand values", () => {
    const result = calculateAxial(AXIAL_EXAMPLE);
    expect(result.original_area_mm2).toBeCloseTo(50.2654824574366918154, 12);
    expect(result.factored_demand_N).toBe(12500);
    expect(result.engineering_stress_MPa).toBeCloseTo(
      248.67959858108646214,
      11,
    );
    expect(result.nominal_yield_load_N).toBeCloseTo(32169.908772759482762, 10);
    expect(result.model_margin).toBeCloseTo(1.57359270182075862, 13);
    expect(result.demand_ratio).toBeCloseTo(0.388561872782947597, 14);
    expect(result.status).toBe("WITHIN_MODELED_YIELD");
  });
  it("uses area scaling and distinguishes stress from yield strength", () => {
    const a = calculateAxial(AXIAL_EXAMPLE);
    const b = calculateAxial({ ...AXIAL_EXAMPLE, diameter_mm: 16 });
    expect(b.nominal_yield_load_N).toBeCloseTo(4 * a.nominal_yield_load_N, 10);
    expect(b.engineering_stress_MPa).toBeCloseTo(
      a.engineering_stress_MPa / 4,
      12,
    );
    expect(
      calculateAxial({ ...AXIAL_EXAMPLE, tensile_yield_strength_MPa: 320 })
        .engineering_stress_MPa,
    ).toBe(a.engineering_stress_MPa);
  });
  it("classifies equal and near-boundary demand with the documented relative tolerance", () => {
    const cap = 32169.908772759482762;
    for (const scale of [1, 1 - 0.5e-12, 1 + 0.5e-12]) {
      const r = calculateAxial({
        ...AXIAL_EXAMPLE,
        axial_force_N: cap * scale,
        load_factor: 1,
      });
      expect(r.status).toBe("AT_MODELED_YIELD");
      expect(r.model_margin).toBe(0);
    }
    expect(
      calculateAxial({
        ...AXIAL_EXAMPLE,
        axial_force_N: cap * (1 - 2e-12),
        load_factor: 1,
      }).status,
    ).toBe("WITHIN_MODELED_YIELD");
    expect(
      calculateAxial({
        ...AXIAL_EXAMPLE,
        axial_force_N: cap * (1 + 2e-12),
        load_factor: 1,
      }).status,
    ).toBe("ABOVE_MODELED_YIELD");
  });
  it("rejects compression, missing/unknown and nonfinite inputs, factor below one, and numeric extremes", () => {
    for (const key of Object.keys(AXIAL_EXAMPLE))
      for (const bad of [0, -1, NaN, Infinity, "8", null])
        expect(() =>
          calculateAxial({ ...AXIAL_EXAMPLE, [key]: bad } as AxialInputs),
        ).toThrow();
    for (const bad of [
      { ...AXIAL_EXAMPLE, load_factor: 0.99 },
      { ...AXIAL_EXAMPLE, diameter_mm: 1e308 },
      { ...AXIAL_EXAMPLE, diameter_mm: 1e-300 },
      { ...AXIAL_EXAMPLE, axial_force_N: 1e308, load_factor: 100 },
      { ...AXIAL_EXAMPLE, axial_force_N: Number.MIN_VALUE },
      { ...AXIAL_EXAMPLE, shear_planes: 2 },
      {},
    ])
      expect(() => calculateAxial(bad as AxialInputs)).toThrow();
  });
});
describe("isolated immutable axial snapshots", () => {
  it("saves and reads axial reports without changing any v1 shear bytes", () => {
    const store = new MemoryStorage();
    const shear = buildReport({
      tensile_yield_strength_MPa: 640,
      diameter_mm: 8,
      applied_shear_N: 10000,
    });
    expect(saveReport(shear, store).ok).toBe(true);
    const oldBytes = store.getItem(HISTORY_STORAGE_KEY);
    const axial = buildAxialReport(AXIAL_EXAMPLE);
    expect(axial.report_schema_version).toBe(AXIAL_SCHEMA);
    expect(saveAxialReport(axial, store).saved).toBe(true);
    expect(readAxialHistory(store).reports[0]).toEqual(axial);
    expect(store.getItem(HISTORY_STORAGE_KEY)).toBe(oldBytes);
    expect(readHistory(store).reports[0]).toEqual(shear);
    expect(isAxialReport(shear)).toBe(false);
    expect(saveReport(axial as never, store).ok).toBe(false);
    expect(store.getItem(HISTORY_STORAGE_KEY)).toBe(oldBytes);
  });
  it("rejects tampered numerical output, source, formula, units, schema and model metadata", () => {
    const source = buildAxialReport(AXIAL_EXAMPLE);
    for (const tamper of [
      (r: typeof source) => {
        r.result.nominal_yield_load_N *= 2;
      },
      (r: typeof source) => {
        r.formula_source.url = "https://bad.example" as never;
      },
      (r: typeof source) => {
        r.inputs.axial_force_N = 1;
      },
      (r: typeof source) => {
        r.report_schema_version = "1.0" as never;
      },
      (r: typeof source) => {
        r.units.diameter_mm = "m";
      },
      (r: typeof source) => {
        r.limitations.pop();
      },
      (r: typeof source) => {
        r.model.id = "other";
      },
      (r: typeof source) => {
        r.formula.original_area = "wrong" as never;
      },
    ]) {
      const changed = structuredClone(source);
      tamper(changed);
      expect(isAxialReport(changed)).toBe(false);
    }
  });
  it("preserves malformed and unsupported history, full capacity, duplicate conflicts and quota failures", () => {
    const store = new MemoryStorage();
    const report = buildAxialReport(AXIAL_EXAMPLE);
    for (const raw of [
      "broken",
      JSON.stringify({
        storage_schema_version: 1,
        reports: [],
        future_metadata: "preserve me",
      }),
      JSON.stringify({ storage_schema_version: 2, reports: [] }),
      JSON.stringify({ storage_schema_version: 1, reports: [report, report] }),
      " ".repeat(1_000_001),
    ]) {
      store.setItem(AXIAL_HISTORY_KEY, raw);
      expect(saveAxialReport(report, store).saved).toBe(false);
      expect(store.getItem(AXIAL_HISTORY_KEY)).toBe(raw);
    }
    store.data.clear();
    expect(saveAxialReport(report, store).saved).toBe(true);
    const bytes = store.getItem(AXIAL_HISTORY_KEY);
    expect(saveAxialReport(report, store).saved).toBe(true);
    expect(store.getItem(AXIAL_HISTORY_KEY)).toBe(bytes);
    const conflict = buildAxialReport(
      { ...AXIAL_EXAMPLE, diameter_mm: 10 },
      { report_id: report.report_id, created_at: report.created_at },
    );
    expect(saveAxialReport(conflict, store).saved).toBe(false);
    expect(store.getItem(AXIAL_HISTORY_KEY)).toBe(bytes);
    store.failWrite = true;
    expect(saveAxialReport(buildAxialReport(AXIAL_EXAMPLE), store).saved).toBe(
      false,
    );
    expect(store.getItem(AXIAL_HISTORY_KEY)).toBe(bytes);
    store.failWrite = false;
    const full = JSON.stringify({
      storage_schema_version: 1,
      reports: Array.from({ length: 50 }, (_, i) =>
        buildAxialReport(AXIAL_EXAMPLE, {
          report_id: `report-${i}`,
          created_at: report.created_at,
        }),
      ),
    });
    store.setItem(AXIAL_HISTORY_KEY, full);
    expect(saveAxialReport(report, store).saved).toBe(false);
    expect(store.getItem(AXIAL_HISTORY_KEY)).toBe(full);
    store.failRead = true;
    expect(readAxialHistory(store).state).toBe("unavailable");
    expect(saveAxialReport(report, store).saved).toBe(false);
    expect(saveAxialReport(report, null).saved).toBe(false);
  });
});
