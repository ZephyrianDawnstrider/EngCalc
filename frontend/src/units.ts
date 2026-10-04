// NIST SP 811 Appendix B.8. Customary factors derive from exact definitions:
// international inch/foot, avoirdupois pound, and standard gravity (no survey foot).
const INCH = 0.0254,
  FOOT = 0.3048,
  POUND = 0.45359237,
  GRAVITY = 9.80665;
const LBF = POUND * GRAVITY,
  US_GALLON = 231 * INCH ** 3,
  IMP_GALLON = 0.00454609;
const BTU_IT = 1055.05585262;
export interface UnitDefinition {
  label: string;
  scale: number;
  zero?: number;
  minimum?: number;
}
const u = (scale: number, label: string): UnitDefinition => ({ scale, label });
export const UNIT_GROUPS = {
  Force: {
    N: u(1, "newton"),
    kN: u(1000, "kilonewton"),
    MN: u(1e6, "meganewton"),
    lbf: u(LBF, "pound-force"),
    kip: u(1000 * LBF, "kilopound-force"),
    kgf: u(GRAVITY, "kilogram-force"),
  },
  Stress: {
    Pa: u(1, "pascal"),
    kPa: u(1000, "kilopascal"),
    MPa: u(1e6, "megapascal"),
    GPa: u(1e9, "gigapascal"),
    bar: u(1e5, "bar"),
    mbar: u(100, "millibar"),
    psi: u(LBF / INCH ** 2, "pound-force per square inch"),
    ksi: u((1000 * LBF) / INCH ** 2, "kilopound-force per square inch"),
    atm: u(101325, "standard atmosphere"),
  },
  Length: {
    mm: u(0.001, "millimetre"),
    cm: u(0.01, "centimetre"),
    m: u(1, "metre"),
    km: u(1000, "kilometre"),
    µm: u(1e-6, "micrometre"),
    in: u(INCH, "inch"),
    ft: u(FOOT, "international foot"),
    yd: u(3 * FOOT, "yard"),
    mi: u(5280 * FOOT, "mile"),
  },
  Area: {
    "mm²": u(1e-6, "square millimetre"),
    "cm²": u(1e-4, "square centimetre"),
    "m²": u(1, "square metre"),
    "km²": u(1e6, "square kilometre"),
    "in²": u(INCH ** 2, "square inch"),
    "ft²": u(FOOT ** 2, "square international foot"),
    "yd²": u((3 * FOOT) ** 2, "square yard"),
    ha: u(10000, "hectare"),
    acre: u(43560 * FOOT ** 2, "international acre"),
  },
  Volume: {
    L: u(0.001, "litre"),
    mL: u(1e-6, "millilitre"),
    "m³": u(1, "cubic metre"),
    "cm³": u(1e-6, "cubic centimetre"),
    "mm³": u(1e-9, "cubic millimetre"),
    "in³": u(INCH ** 3, "cubic inch"),
    "ft³": u(FOOT ** 3, "cubic foot"),
    "US gal": u(US_GALLON, "US liquid gallon"),
    "Imp gal": u(IMP_GALLON, "Imperial gallon"),
  },
  Mass: {
    kg: u(1, "kilogram"),
    g: u(0.001, "gram"),
    mg: u(1e-6, "milligram"),
    t: u(1000, "metric tonne"),
    lb: u(POUND, "avoirdupois pound (mass)"),
    oz: u(POUND / 16, "avoirdupois ounce"),
    "US ton": u(2000 * POUND, "US short ton"),
    "long ton": u(2240 * POUND, "Imperial long ton"),
  },
  Torque: {
    "N·m": u(1, "newton metre"),
    "N·mm": u(0.001, "newton millimetre"),
    "kN·m": u(1000, "kilonewton metre"),
    "lbf·ft": u(LBF * FOOT, "pound-force foot"),
    "lbf·in": u(LBF * INCH, "pound-force inch"),
  },
  Energy: {
    J: u(1, "joule"),
    kJ: u(1000, "kilojoule"),
    MJ: u(1e6, "megajoule"),
    Wh: u(3600, "watt hour"),
    kWh: u(3.6e6, "kilowatt hour"),
    "cal(th)": u(4.184, "thermochemical calorie"),
    "kcal(th)": u(4184, "thermochemical kilocalorie"),
    "Btu(IT)": u(BTU_IT, "International Table British thermal unit"),
    "ft·lbf": u(LBF * FOOT, "foot pound-force"),
  },
  Power: {
    W: u(1, "watt"),
    kW: u(1000, "kilowatt"),
    MW: u(1e6, "megawatt"),
    "hp(mech)": u(550 * LBF * FOOT, "mechanical horsepower"),
    "hp(metric)": u(75 * GRAVITY, "metric horsepower"),
    "Btu(IT)/h": u(BTU_IT / 3600, "International Table Btu per hour"),
  },
  Speed: {
    "m/s": u(1, "metre per second"),
    "km/h": u(1 / 3.6, "kilometre per hour"),
    "mm/s": u(0.001, "millimetre per second"),
    "ft/s": u(FOOT, "foot per second"),
    mph: u((5280 * FOOT) / 3600, "mile per hour"),
    kn: u(1852 / 3600, "knot"),
  },
  Acceleration: {
    "m/s²": u(1, "metre per second squared"),
    "mm/s²": u(0.001, "millimetre per second squared"),
    "ft/s²": u(FOOT, "foot per second squared"),
    "g₀": u(GRAVITY, "standard gravity"),
  },
  Density: {
    "kg/m³": u(1, "kilogram per cubic metre"),
    "g/cm³": u(1000, "gram per cubic centimetre"),
    "kg/L": u(1000, "kilogram per litre"),
    "lb/ft³": u(POUND / FOOT ** 3, "pound per cubic foot"),
    "lb/in³": u(POUND / INCH ** 3, "pound per cubic inch"),
    "lb/US gal": u(POUND / US_GALLON, "pound per US liquid gallon"),
  },
  Flow: {
    "L/min": u(0.001 / 60, "litre per minute"),
    "L/s": u(0.001, "litre per second"),
    "m³/s": u(1, "cubic metre per second"),
    "m³/h": u(1 / 3600, "cubic metre per hour"),
    "mL/min": u(1e-6 / 60, "millilitre per minute"),
    "US gal/min": u(US_GALLON / 60, "US liquid gallon per minute"),
    "Imp gal/min": u(IMP_GALLON / 60, "Imperial gallon per minute"),
    "ft³/min": u(FOOT ** 3 / 60, "cubic foot per minute"),
  },
  "Dynamic viscosity": {
    "Pa·s": u(1, "pascal second"),
    "mPa·s": u(0.001, "millipascal second"),
    cP: u(0.001, "centipoise"),
    P: u(0.1, "poise"),
  },
  "Kinematic viscosity": {
    "m²/s": u(1, "square metre per second"),
    "mm²/s": u(1e-6, "square millimetre per second"),
    cSt: u(1e-6, "centistokes"),
    St: u(1e-4, "stokes"),
  },
  // For absolute temperatures, zero is the reading at zero Celsius.
  Temperature: {
    "°C": { ...u(1, "degree Celsius"), zero: 0, minimum: -273.15 },
    "°F": { ...u(5 / 9, "degree Fahrenheit"), zero: 32, minimum: -459.67 },
    K: { ...u(1, "kelvin"), zero: 273.15, minimum: 0 },
    "°R": { ...u(5 / 9, "degree Rankine"), zero: 491.67, minimum: 0 },
  },
  "Temperature difference": {
    "Δ°C": u(1, "Celsius interval"),
    "Δ°F": u(5 / 9, "Fahrenheit interval"),
    ΔK: u(1, "kelvin interval"),
    "Δ°R": u(5 / 9, "Rankine interval"),
  },
  Angle: {
    "°": u(Math.PI / 180, "degree"),
    rad: u(1, "radian"),
    rev: u(2 * Math.PI, "revolution"),
    arcmin: u(Math.PI / 10800, "arcminute"),
    arcsec: u(Math.PI / 648000, "arcsecond"),
  },
  Time: {
    s: u(1, "second"),
    ms: u(0.001, "millisecond"),
    µs: u(1e-6, "microsecond"),
    min: u(60, "minute"),
    h: u(3600, "hour"),
    d: u(86400, "day (24 hours)"),
  },
  Frequency: {
    Hz: u(1, "hertz"),
    kHz: u(1000, "kilohertz"),
    MHz: u(1e6, "megahertz"),
    GHz: u(1e9, "gigahertz"),
    "cycles/min": u(1 / 60, "cycles per minute"),
  },
} satisfies Record<string, Record<string, UnitDefinition>>;
export type UnitGroup = keyof typeof UNIT_GROUPS;
export type ForceUnit = "N" | "kN";
export const QUANTITIES = Object.keys(UNIT_GROUPS) as UnitGroup[];
export const quantityLabel = (group: UnitGroup) =>
  group === "Stress"
    ? "Pressure / stress"
    : group === "Flow"
      ? "Volumetric flow"
      : group === "Temperature"
        ? "Temperature (absolute)"
        : group;
export const unitDefinitions = (
  group: UnitGroup,
): Record<string, UnitDefinition> => UNIT_GROUPS[group];
export const QUANTITY_NOTES: Partial<Record<UnitGroup, string>> = {
  Stress:
    "Converts units only; it does not change gauge pressure to absolute pressure.",
  Volume: "US liquid gallons and Imperial gallons have different volumes.",
  Mass: "lb is mass. Use Force for lbf (pound-force). Tons are explicitly US short or Imperial long tons.",
  Torque:
    "Torque and energy are separate quantities, even when their conversion factors match.",
  Area: "Feet and acres use the international foot, not the retired US survey foot.",
  Energy:
    "Btu uses the International Table definition; calorie uses the thermochemical definition.",
  Power: "Mechanical and metric horsepower are distinct definitions.",
  Flow: "Volumetric flow only. Converting to mass flow requires fluid density.",
  "Dynamic viscosity":
    "Dynamic and kinematic viscosity are distinct; converting between them requires density.",
  "Kinematic viscosity":
    "Kinematic and dynamic viscosity are distinct; converting between them requires density.",
  Temperature:
    "Absolute readings include an offset. For a temperature rise or drop, choose Temperature difference.",
  "Temperature difference":
    "Intervals use scale only: a change of 9 °F equals a change of 5 °C. Negative changes are allowed.",
  Frequency:
    "cycles/min is frequency; it is not angular velocity in radians per second.",
};
export function convertUnits(
  raw: string,
  group: UnitGroup,
  from: string,
  to: string,
): number {
  if (!raw.trim()) throw new Error("Enter a value to convert.");
  if (!Object.hasOwn(UNIT_GROUPS, group))
    throw new Error("Choose a supported quantity.");
  const units = unitDefinitions(group);
  if (!Object.hasOwn(units, from) || !Object.hasOwn(units, to))
    throw new Error("Choose units in the same quantity.");
  const value = Number(raw);
  if (!Number.isFinite(value))
    throw new Error("This value is outside the supported numeric range.");
  const source = units[from],
    target = units[to];
  if (source.minimum !== undefined && value < source.minimum)
    throw new Error("Absolute temperature cannot be below absolute zero.");
  // Preserve canonical calculator precision. Round only when formatting for display.
  if (from === to) return value;
  const result =
    group === "Temperature"
      ? value === source.minimum
        ? target.minimum!
        : (value - source.zero!) * (source.scale / target.scale) + target.zero!
      : value * (source.scale / target.scale);
  if (
    !Number.isFinite(result) ||
    (group !== "Temperature" && value !== 0 && result === 0)
  )
    throw new Error("This value is outside the supported numeric range.");
  return Object.is(result, -0) ? 0 : result;
}
export function formatConversion(value: number): string {
  return String(Number(value.toPrecision(12)));
}
export function conversionRule(
  group: UnitGroup,
  from: string,
  to: string,
): string {
  const units = unitDefinitions(group),
    source = units[from],
    target = units[to];
  const ratio = formatConversion(source.scale / target.scale);
  return group === "Temperature"
    ? `${to} = (${from} − ${source.zero}) × ${ratio} + ${target.zero}`
    : `1 ${from} ≈ ${ratio} ${to}`;
}
