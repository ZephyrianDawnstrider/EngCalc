import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildReport,
  calculateShearIntermediates,
  calculateShearResult,
  type CalculationReport,
  type ShearInputs,
} from "../../src/core/calculator";

type OracleCase = {
  name: string;
  inputs: Record<string, unknown>;
  accepted: boolean;
  report?: CalculationReport;
};

const oraclePath = resolve(process.cwd(), "tests", "parity", "oracle.py");
const oracleCases = JSON.parse(
  execFileSync("python", [oraclePath], { encoding: "utf8" }),
) as OracleCase[];

function decodeSentinels(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decodeSentinels);
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    if (Object.keys(object).length === 1 && "$number" in object) {
      switch (object.$number) {
        case "NaN": return Number.NaN;
        case "Infinity": return Number.POSITIVE_INFINITY;
        case "-Infinity": return Number.NEGATIVE_INFINITY;
        case "Underflow": return 0;
        case "Huge": return Number.POSITIVE_INFINITY;
      }
    }
    return Object.fromEntries(
      Object.entries(object).map(([key, item]) => [key, decodeSentinels(item)]),
    );
  }
  return value;
}

function expectParity(actual: unknown, expected: unknown, location = "report"): void {
  if (typeof expected === "number" && typeof actual === "number") {
    const tolerance = 2e-14 * Math.max(Math.abs(actual), Math.abs(expected));
    expect(Math.abs(actual - expected), location).toBeLessThanOrEqual(tolerance);
    return;
  }
  if (Array.isArray(expected)) {
    expect(actual, `${location} array`).toBeInstanceOf(Array);
    const actualArray = actual as unknown[];
    expect(actualArray).toHaveLength(expected.length);
    expected.forEach((item, index) => expectParity(actualArray[index], item, `${location}[${index}]`));
    return;
  }
  if (expected !== null && typeof expected === "object") {
    expect(actual, `${location} object`).not.toBeNull();
    const actualObject = actual as Record<string, unknown>;
    const expectedObject = expected as Record<string, unknown>;
    expect(Object.keys(actualObject).sort(), `${location} keys`).toEqual(Object.keys(expectedObject).sort());
    for (const key of Object.keys(expectedObject)) {
      expectParity(actualObject[key], expectedObject[key], `${location}.${key}`);
    }
    return;
  }
  expect(actual, location).toEqual(expected);
}

describe("pure TypeScript calculator parity with the Python v1 model", () => {
  it("matches complete versioned reports for golden and boundary cases", () => {
    const accepted = oracleCases.filter((testCase) => testCase.accepted);
    expect(accepted.length).toBeGreaterThanOrEqual(7);
    for (const testCase of accepted) {
      const report = buildReport(decodeSentinels(testCase.inputs) as ShearInputs);
      const deterministicResult = calculateShearResult(
        decodeSentinels(testCase.inputs) as ShearInputs,
      );
      const deterministicIntermediates = calculateShearIntermediates(
        decodeSentinels(testCase.inputs) as ShearInputs,
      );
      expect(report.report_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(report.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+00:00$/);
      expect(Date.parse(report.created_at)).not.toBeNaN();

      const normalized: CalculationReport = {
        ...report,
        report_id: testCase.report!.report_id,
        created_at: testCase.report!.created_at,
      };
      expectParity(normalized, testCase.report, testCase.name);
      expectParity(deterministicResult, testCase.report!.result, `${testCase.name}.deterministicResult`);
      expectParity(
        deterministicIntermediates,
        testCase.report!.intermediates,
        `${testCase.name}.deterministicIntermediates`,
      );
    }
  });

  it("rejects the same malformed, nonfinite, overflow, underflow, and schema inputs as Python", () => {
    const rejected = oracleCases.filter((testCase) => !testCase.accepted);
    expect(rejected.length).toBeGreaterThanOrEqual(14);
    for (const testCase of rejected) {
      expect(
        () => buildReport(decodeSentinels(testCase.inputs) as ShearInputs),
        testCase.name,
      ).toThrow();
    }
    expect(() => buildReport(null as unknown as ShearInputs)).toThrow();
    expect(() => buildReport([] as unknown as ShearInputs)).toThrow();
  });

  it("returns fresh report metadata arrays for each calculation", () => {
    const inputs: ShearInputs = {
      tensile_yield_strength_MPa: 640,
      diameter_mm: 8,
      applied_shear_N: 10000,
    };
    const first = buildReport(inputs);
    first.assumptions[0] = "caller mutation";
    first.formula_source.title = "caller mutation";
    const second = buildReport(inputs);
    expect(second.assumptions[0]).toBe("Static, concentric, pure shear on the bolt shank.");
    expect(second.formula_source.title).toBe("Yield and Plastic Flow");
  });
});
