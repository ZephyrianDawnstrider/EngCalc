import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it } from "vitest";
import { UnitConverter } from "../src/UnitConverter";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement, root: Root;
beforeEach(async () => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root.render(<UnitConverter />));
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function select(index: number, value: string) {
  await act(async () => {
    const el = container.querySelectorAll("select")[index];
    el.value = value;
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
async function fill(type: string, value: string) {
  await act(async () => {
    const el = container.querySelector<HTMLInputElement>(
      `input[type="${type}"]`,
    )!;
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
const result = () => container.querySelector(".converter-result")!.textContent;

it("searches full unit names, resets units by quantity, calculates offsets, shows equivalents and swaps", async () => {
  expect(container.querySelector("select")!.options).toHaveLength(20);
  expect(result()).toContain("10000 N");
  await fill("search", "Fahrenheit");
  const matches = container.querySelectorAll<HTMLButtonElement>(
    ".quantity-matches button",
  );
  expect([...matches].map((b) => b.textContent)).toEqual([
    "Temperature (absolute)",
    "Temperature difference",
  ]);
  await act(async () => matches[0].click());
  expect(
    container.querySelector<HTMLInputElement>('input[type="search"]')!.value,
  ).toBe("");
  await select(1, "°F");
  await select(2, "°C");
  await fill("number", "32");
  expect(result()).toContain("0 °C");
  expect(
    container.querySelector(".conversion-equivalents dl")!.textContent,
  ).toContain("273.15");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="Convert to K"]')!
      .click(),
  );
  expect(result()).toContain("273.15 K");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(".converter-actions button")!
      .click(),
  );
  expect(container.querySelectorAll("select")[1].value).toBe("K");
  expect(container.querySelectorAll("select")[2].value).toBe("°F");
  expect(result()).toContain("-402.07 °F");
  await select(0, "Temperature difference");
  await select(1, "Δ°F");
  await select(2, "ΔK");
  await fill("number", "9");
  expect(result()).toContain("5 ΔK");
});

it("separates US and Imperial gallons and clears stale output on invalid temperature or blank input", async () => {
  await select(0, "Volume");
  await select(1, "US gal");
  await select(2, "L");
  await fill("number", "1");
  expect(result()).toContain("3.785411784 L");
  await select(1, "Imp gal");
  expect(result()).toContain("4.54609 L");
  await select(0, "Temperature");
  await select(1, "K");
  await fill("number", "-1");
  expect(result()).toContain("below absolute zero");
  expect(container.querySelector(".converter-result strong")).toBeNull();
  expect(
    [...container.querySelectorAll("dd")].every((el) => el.textContent === "—"),
  ).toBe(true);
  await fill("number", "");
  expect(result()).toContain("Enter a value");
  await fill("search", "not-a-quantity");
  expect(container.querySelector(".quantity-matches")!.textContent).toContain(
    "No matching quantity",
  );
});
