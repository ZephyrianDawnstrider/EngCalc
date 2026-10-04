import { useState } from "react";
import { convertUnits, UNIT_GROUPS, type UnitGroup } from "./units";

export function UnitConverter() {
  const [group, setGroup] = useState<UnitGroup>("Force");
  const [value, setValue] = useState("10");
  const [from, setFrom] = useState("kN");
  const [to, setTo] = useState("N");
  let result = "";
  let error = "";
  try {
    result = String(convertUnits(value, group, from, to));
  } catch (cause) {
    error = (cause as Error).message;
  }
  function changeGroup(next: UnitGroup) {
    const units = Object.keys(UNIT_GROUPS[next]);
    setGroup(next);
    setFrom(units[0]);
    setTo(units[1]);
  }
  return (
    <section className="card converter" aria-labelledby="converter-title">
      <p className="eyebrow">Engineering essentials</p>
      <h2 id="converter-title">SI unit converter</h2>
      <p className="card-intro">
        Convert force, stress, and length. No material assumptions or design
        checks.
      </p>
      <div className="input-grid">
        <label className="field wide-field">
          Quantity
          <select
            value={group}
            onChange={(e) => changeGroup(e.target.value as UnitGroup)}
          >
            {Object.keys(UNIT_GROUPS).map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label className="field wide-field">
          Value to convert
          <input
            type="number"
            step="any"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <label className="field">
          From unit
          <select value={from} onChange={(e) => setFrom(e.target.value)}>
            {Object.keys(UNIT_GROUPS[group]).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
        <label className="field">
          To unit
          <select value={to} onChange={(e) => setTo(e.target.value)}>
            {Object.keys(UNIT_GROUPS[group]).map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="converter-result" role="status">
        {error || (
          <>
            <span>Converted value</span>
            <strong>
              {result} <small>{to}</small>
            </strong>
            <p>
              {value} {from} = {result} {to}
            </p>
          </>
        )}
      </div>
      <p className="muted">
        Prefix scaling follows the{" "}
        <a
          href="https://www.nist.gov/pml/owm/metric-si-prefixes"
          target="_blank"
          rel="noreferrer"
        >
          NIST SI prefix definitions
        </a>
        . Display uses browser floating-point arithmetic. Results are not
        stored.
      </p>
    </section>
  );
}
