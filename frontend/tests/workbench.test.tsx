import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";
import { HISTORY_STORAGE_KEY } from "../src/history";

vi.mock("../src/pwa", () => ({
  PWA_APP_VERSION: "0.2.0",
  subscribePwaState: () => () => {},
  requestInstall: vi.fn(),
  activateUpdateForNextNavigation: vi.fn(),
}));

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
function button(name: string): HTMLButtonElement {
  const found = [
    ...container.querySelectorAll<HTMLButtonElement>("button"),
  ].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`Button missing: ${name}`);
  return found;
}
async function click(name: string) {
  await act(async () => button(name).click());
}
async function fill(selector: string, value: string) {
  const input = container.querySelector<HTMLInputElement>(selector)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function select(selector: string, value: string) {
  await act(async () => {
    const input = container.querySelector<HTMLSelectElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function submit() {
  await act(async () =>
    container
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
function saved() {
  return JSON.parse(localStorage.getItem(HISTORY_STORAGE_KEY)!).reports;
}

beforeEach(async () => {
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<App />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

describe("workbench scenario journeys", () => {
  it("converts load units, calculates canonical N, pins and compares immutable snapshots", async () => {
    await select('[aria-label="Load unit"]', "kN");
    expect(container.querySelector<HTMLInputElement>("#load")!.value).toBe(
      "10",
    );
    await submit();
    const baseline = saved()[0];
    expect(baseline.inputs.applied_shear_load.value).toBe(10000);
    await click("Pin as comparison");
    const bytes = localStorage.getItem(HISTORY_STORAGE_KEY);
    await fill("#load", "20");
    expect(container.querySelector(".stale-message")?.textContent).toContain(
      "Inputs changed",
    );
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(bytes);
    await submit();
    const reports = saved();
    expect(reports).toHaveLength(2);
    expect(reports[1]).toEqual(baseline);
    expect(reports[0].inputs.applied_shear_load.value).toBe(20000);
    expect(container.querySelector("table")?.textContent).toContain("20 kN");
    expect(container.querySelector("table")?.textContent).toContain("10 kN");
    const comparedBytes = localStorage.getItem(HISTORY_STORAGE_KEY);
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>(".history-item")[1].click(),
    );
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(comparedBytes);
    expect(container.querySelector(".report-meta")?.textContent).toContain(
      baseline.report_id,
    );
    await click("Clear comparison");
    expect(container.querySelector(".comparison")).toBeNull();
  });
  it("keeps the last result on invalid inputs and never saves an invalid scenario", async () => {
    await click("Run example");
    const bytes = localStorage.getItem(HISTORY_STORAGE_KEY);
    await fill("#load", "");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Enter a value",
    );
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(bytes);
    expect(container.querySelector(".stale-message")).not.toBeNull();
    await fill("#load", "-1");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "finite positive",
    );
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(bytes);
  });
  it("preserves a draft and selected report while using the independent unit module", async () => {
    await click("Run example");
    await fill("#load", "12345");
    const bytes = localStorage.getItem(HISTORY_STORAGE_KEY);
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>(".nav-item")[1].click(),
    );
    expect(container.querySelector(".converter-result")?.textContent).toContain(
      "10000 N",
    );
    expect(container.querySelector(".converter")!.parentElement!.hidden).toBe(
      false,
    );
    await act(async () =>
      container.querySelectorAll<HTMLButtonElement>(".nav-item")[0].click(),
    );
    expect(container.querySelector<HTMLInputElement>("#load")!.value).toBe(
      "12345",
    );
    expect(container.querySelector(".stale-message")).not.toBeNull();
    expect(localStorage.getItem(HISTORY_STORAGE_KEY)).toBe(bytes);
    expect(container.querySelector(".planned")?.textContent).toContain(
      "unavailable",
    );
  });
  it("contains all report assumptions and source in the printable report, even with collapsed steps", async () => {
    await click("Run example");
    const report = saved()[0];
    for (const text of [...report.assumptions, ...report.limitations])
      expect(container.querySelector(".print-method")?.textContent).toContain(
        text,
      );
    expect(container.querySelector(".print-method")?.textContent).toContain(
      report.formula_source.url,
    );
    expect(container.querySelector(".input-snapshot")?.textContent).toContain(
      "10000 N",
    );
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    await click("Print report");
    expect(print).toHaveBeenCalledOnce();
  });
});
