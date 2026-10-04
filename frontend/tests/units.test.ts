import { describe, expect, it } from "vitest";
import {
  convertUnits,
  formatConversion,
  UNIT_GROUPS,
  type UnitGroup,
} from "../src/units";
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

describe("engineering conversion reference values", () => {
  // Independent reference values from NIST SP 811 B.8, or exact definitions.
  it.each<[UnitGroup, string, string, string, number]>([
    ["Force", "1", "lbf", "N", 4.4482216152605],
    ["Stress", "1", "psi", "Pa", 6894.757293168],
    ["Length", "1", "in", "mm", 25.4],
    ["Area", "1", "ft²", "m²", 0.09290304],
    ["Area", "1", "acre", "m²", 4046.8564224],
    ["Volume", "1", "US gal", "L", 3.785411784],
    ["Volume", "1", "Imp gal", "L", 4.54609],
    ["Volume", "1", "in³", "cm³", 16.387064],
    ["Mass", "1", "lb", "kg", 0.45359237],
    ["Mass", "1", "US ton", "lb", 2000],
    ["Mass", "1", "long ton", "lb", 2240],
    ["Torque", "1", "lbf·ft", "N·m", 1.3558179483314],
    ["Energy", "1", "kWh", "J", 3600000],
    ["Energy", "1", "Btu(IT)", "J", 1055.05585262],
    ["Power", "1", "hp(mech)", "W", 745.6998715823],
    ["Power", "1", "hp(metric)", "W", 735.49875],
    ["Speed", "60", "mph", "m/s", 26.8224],
    ["Speed", "1", "kn", "km/h", 1.852],
    ["Acceleration", "1", "g₀", "m/s²", 9.80665],
    ["Density", "1", "lb/ft³", "kg/m³", 16.01846337396],
    ["Flow", "1", "US gal/min", "L/min", 3.785411784],
    ["Flow", "1", "Imp gal/min", "L/min", 4.54609],
    ["Dynamic viscosity", "1", "cP", "Pa·s", 0.001],
    ["Kinematic viscosity", "1", "cSt", "m²/s", 0.000001],
    ["Temperature", "32", "°F", "°C", 0],
    ["Temperature", "212", "°F", "K", 373.15],
    ["Temperature", "-40", "°C", "°F", -40],
    ["Temperature", "491.67", "°R", "K", 273.15],
    ["Temperature difference", "9", "Δ°F", "ΔK", 5],
    ["Temperature difference", "-10", "Δ°C", "Δ°F", -18],
    ["Angle", "180", "°", "rad", Math.PI],
    ["Time", "1", "d", "s", 86400],
    ["Frequency", "60", "cycles/min", "Hz", 1],
  ])("%s: %s %s → %s", (group, value, from, to, expected) => {
    const result = convertUnits(value, group, from, to);
    expect(Math.abs(result - expected)).toBeLessThanOrEqual(
      Math.max(1e-12, Math.abs(expected) * 1e-11),
    );
  });

  it("round-trips all registered units without truncating calculator precision", () => {
    expect(Object.keys(UNIT_GROUPS)).toHaveLength(20);
    for (const group of Object.keys(UNIT_GROUPS) as UnitGroup[]) {
      const units = Object.keys(UNIT_GROUPS[group]);
      for (const from of units)
        for (const to of units) {
          const input = group === "Temperature" ? 300 : 123.45678912345;
          const output = convertUnits(String(input), group, from, to);
          const restored = convertUnits(String(output), group, to, from);
          expect(restored).toBeCloseTo(input, 9);
        }
    }
  });

  it("accepts absolute zero in all four scales and rejects lower readings, including same-unit requests", () => {
    const zeroes = { "°C": -273.15, "°F": -459.67, K: 0, "°R": 0 };
    for (const [from, value] of Object.entries(zeroes)) {
      for (const [to, expected] of Object.entries(zeroes)) {
        expect(convertUnits(String(value), "Temperature", from, to)).toBe(
          expected,
        );
        expect(() =>
          convertUnits(String(value - 0.001), "Temperature", from, to),
        ).toThrow("absolute zero");
      }
    }
    expect(convertUnits("32", "Temperature", "°F", "°C")).toBe(0);
    expect(convertUnits("-500", "Temperature difference", "Δ°C", "ΔK")).toBe(
      -500,
    );
  });

  it("rejects incompatible quantities and numeric overflow without showing a stale number", () => {
    expect(() => convertUnits("1", "Mass", "lbf", "kg")).toThrow(
      "same quantity",
    );
    expect(() => convertUnits("1", "Temperature", "Δ°C", "K")).toThrow(
      "same quantity",
    );
    expect(() => convertUnits("1", "Flow", "kg/s", "L/s")).toThrow(
      "same quantity",
    );
    expect(() => convertUnits("1", "bad" as UnitGroup, "N", "N")).toThrow(
      "supported quantity",
    );
    expect(() => convertUnits("1e308", "Temperature", "°C", "°F")).toThrow(
      "numeric range",
    );
    expect(() => convertUnits("5e-324", "Length", "mm", "m")).toThrow(
      "numeric range",
    );
    expect(formatConversion(1 / 3)).toBe("0.333333333333");
    expect(formatConversion(1e-15)).toBe("1e-15");
  });
});
