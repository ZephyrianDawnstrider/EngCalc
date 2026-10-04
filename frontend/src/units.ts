export const UNIT_GROUPS = {
  Force: { N: 1, kN: 1000, MN: 1_000_000 },
  Stress: { Pa: 1, kPa: 1000, MPa: 1_000_000, GPa: 1_000_000_000 },
  Length: { mm: 0.001, cm: 0.01, m: 1 },
} as const;
export type UnitGroup = keyof typeof UNIT_GROUPS;
export type ForceUnit = "N" | "kN";

/** SI prefix scaling only. Never changes material properties or model outputs. */
export function convertUnits(
  raw: string,
  group: UnitGroup,
  from: string,
  to: string,
): number {
  if (!raw.trim()) throw new Error("Enter a value to convert.");
  const value = Number(raw);
  const factors: Record<string, number> = UNIT_GROUPS[group];
  if (!Object.hasOwn(factors, from) || !Object.hasOwn(factors, to))
    throw new Error("Choose units in the same quantity.");
  const result = value * (factors[from] / factors[to]);
  if (
    !Number.isFinite(value) ||
    !Number.isFinite(result) ||
    (value !== 0 && result === 0)
  ) {
    throw new Error("This value is outside the supported numeric range.");
  }
  return result;
}
