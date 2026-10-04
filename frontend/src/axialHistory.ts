import { buildAxialReport, type AxialReport } from "./core/axialCalculator";
import type { StorageLike } from "./history";

export const AXIAL_HISTORY_KEY = "engcalc.axial-report-history.v1";
export const AXIAL_HISTORY_LIMIT = 50;
const MAX_BYTES = 1_000_000;
type State = "ready" | "unavailable" | "corrupt" | "unsupported";
export type AxialHistory = {
  state: State;
  reports: AxialReport[];
  message: string;
};
const empty = (state: State, message = ""): AxialHistory => ({
  state,
  reports: [],
  message,
});

function storage(): StorageLike | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
/** Validate a snapshot without mutating it or accepting changed evidence fields. */
function equivalent(actual: unknown, expected: unknown): boolean {
  if (typeof actual === "number" && typeof expected === "number")
    return (
      Number.isFinite(actual) &&
      (actual === expected ||
        Math.abs(actual - expected) <=
          1e-12 * Math.max(Math.abs(actual), Math.abs(expected)))
    );
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      actual.length === expected.length &&
      expected.every((item, i) => equivalent(actual[i], item))
    );
  if (object(expected))
    return (
      object(actual) &&
      Object.keys(actual).length === Object.keys(expected).length &&
      Object.entries(expected).every(
        ([key, value]) =>
          Object.hasOwn(actual, key) && equivalent(actual[key], value),
      )
    );
  return actual === expected;
}
export function isAxialReport(value: unknown): value is AxialReport {
  if (
    !object(value) ||
    typeof value.report_id !== "string" ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(value.report_id) ||
    typeof value.created_at !== "string" ||
    !Number.isFinite(Date.parse(value.created_at))
  )
    return false;
  try {
    const report = value as unknown as AxialReport;
    return equivalent(
      value,
      buildAxialReport(report.inputs, {
        report_id: report.report_id,
        created_at: report.created_at,
      }),
    );
  } catch {
    return false;
  }
}
function parse(raw: string | null): AxialHistory {
  if (raw === null) return empty("ready");
  if (new TextEncoder().encode(raw).byteLength > MAX_BYTES)
    return empty(
      "corrupt",
      "Axial history exceeds the supported size. Stored data was left untouched.",
    );
  try {
    const data: unknown = JSON.parse(raw);
    if (
      !object(data) ||
      typeof data.storage_schema_version !== "number" ||
      Object.keys(data).length !== 2 ||
      !Object.hasOwn(data, "reports")
    )
      return empty(
        "corrupt",
        "Axial history has an invalid structure. Stored data was left untouched.",
      );
    if (data.storage_schema_version !== 1)
      return empty(
        "unsupported",
        "Axial history uses an unsupported storage version. Stored data was left untouched.",
      );
    if (
      !Array.isArray(data.reports) ||
      data.reports.length > AXIAL_HISTORY_LIMIT ||
      !data.reports.every(isAxialReport)
    )
      return empty(
        "corrupt",
        "Axial history contains unsupported or invalid reports. Stored data was left untouched.",
      );
    const reports = data.reports as AxialReport[];
    if (
      new Set(reports.map((report) => report.report_id)).size !== reports.length
    )
      return empty(
        "corrupt",
        "Axial history contains duplicate IDs. Stored data was left untouched.",
      );
    return { state: "ready", reports, message: "" };
  } catch {
    return empty(
      "corrupt",
      "Axial history could not be read. Stored data was left untouched.",
    );
  }
}
export function readAxialHistory(
  store: StorageLike | null = storage(),
): AxialHistory {
  try {
    return store
      ? parse(store.getItem(AXIAL_HISTORY_KEY))
      : empty(
          "unavailable",
          "Local storage is unavailable. You can still calculate, export, and print.",
        );
  } catch {
    return empty(
      "unavailable",
      "Local storage could not be read. You can still export or print.",
    );
  }
}
export function readRawAxialHistory(
  store: StorageLike | null = storage(),
): string | null {
  try {
    return store?.getItem(AXIAL_HISTORY_KEY) ?? null;
  } catch {
    return null;
  }
}
export function saveAxialReport(
  report: AxialReport,
  store: StorageLike | null = storage(),
): AxialHistory & { saved: boolean } {
  const current = readAxialHistory(store);
  const fail = (message: string) => ({ ...current, saved: false, message });
  if (!isAxialReport(report))
    return fail("The axial report failed validation and was not saved.");
  if (!store || current.state !== "ready") return fail(current.message);
  const duplicate = current.reports.find(
    (item) => item.report_id === report.report_id,
  );
  if (duplicate)
    return JSON.stringify(duplicate) === JSON.stringify(report)
      ? { ...current, saved: true, message: "This snapshot is already saved." }
      : fail(
          "A different report uses this ID. Existing history was left unchanged.",
        );
  if (current.reports.length >= AXIAL_HISTORY_LIMIT)
    return fail(
      "Axial history is full (50 reports). No reports were removed. Export the current report.",
    );
  const reports = [report, ...current.reports];
  const serialized = JSON.stringify({ storage_schema_version: 1, reports });
  if (new TextEncoder().encode(serialized).byteLength > MAX_BYTES)
    return fail(
      "Axial history is at its storage-size limit. Export the current report; existing reports were kept.",
    );
  try {
    store.setItem(AXIAL_HISTORY_KEY, serialized);
    if (store.getItem(AXIAL_HISTORY_KEY) !== serialized)
      throw new Error("Storage did not retain snapshot");
    return {
      state: "ready",
      reports,
      saved: true,
      message: "Axial snapshot saved in this browser on this device.",
    };
  } catch {
    return fail(
      "Storage is full or blocked. This report was not saved; export or print it instead.",
    );
  }
}
