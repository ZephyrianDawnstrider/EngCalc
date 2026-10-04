import { describe, expect, it } from "vitest";
import { convertUnits } from "../src/units";
import { buildReport } from "../src/core/calculator";

describe("SI display units", () => {
  it("normalizes kN into the same canonical calculation and report as N", () => {
    const input = {
      tensile_yield_strength_MPa: 640,
      diameter_mm: 8,
      shear_planes: 1,
      fitting_factor: 1,
    };
    const a = buildReport({ ...input, applied_shear_N: 10000 });
    const b = buildReport({
      ...input,
      applied_shear_N: convertUnits("10", "Force", "kN", "N"),
    });
    expect(b.inputs).toEqual(a.inputs);
    expect(b.result).toEqual(a.result);
  });
  it("converts stress and length using SI prefix factors", () => {
    expect(convertUnits("640", "Stress", "MPa", "GPa")).toBe(0.64);
    expect(convertUnits("8", "Length", "mm", "m")).toBe(0.008);
    expect(convertUnits("0", "Force", "N", "kN")).toBe(0);
    expect(convertUnits("-10", "Force", "kN", "N")).toBe(-10000);
  });
  it("preserves fractional and tiny force values without display rounding", () => {
    for (const n of [12345.6789, 0.0000001, 1e100]) {
      expect(
        convertUnits(
          String(convertUnits(String(n), "Force", "N", "kN")),
          "Force",
          "kN",
          "N",
        ),
      ).toBeCloseTo(n, 10);
    }
  });
  it("rejects empty, nonfinite, overflow, underflow, and cross-quantity units", () => {
    for (const raw of ["", " ", "NaN", "Infinity", "1e309", "1e308"])
      expect(() => convertUnits(raw, "Force", "kN", "N")).toThrow();
    expect(() => convertUnits("5e-324", "Force", "N", "kN")).toThrow();
    expect(() => convertUnits("1", "Force", "MPa", "N")).toThrow();
  });
});
