import { useState } from "react";
import {
  convertUnits,
  formatConversion,
  conversionRule,
  QUANTITIES,
  QUANTITY_NOTES,
  quantityLabel,
  unitDefinitions,
  type UnitGroup,
} from "./units";

export function UnitConverter() {
  const [group, setGroup] = useState<UnitGroup>("Force");
  const [value, setValue] = useState("10");
  const [from, setFrom] = useState("kN");
  const [to, setTo] = useState("N");
  const [search, setSearch] = useState("");
  let result = "",
    error = "";
  try {
    result = formatConversion(convertUnits(value, group, from, to));
  } catch (cause) {
    error = (cause as Error).message;
  }
  const units = unitDefinitions(group);
  const needle = search.trim().toLocaleLowerCase();
  const matches = needle
    ? QUANTITIES.filter((q) =>
        [
          quantityLabel(q),
          ...Object.entries(unitDefinitions(q)).map(
            ([symbol, unit]) => symbol + " " + unit.label,
          ),
        ].some((text) => text.toLocaleLowerCase().includes(needle)),
      )
    : [];
  function changeGroup(next: UnitGroup) {
    const names = Object.keys(unitDefinitions(next));
    setGroup(next);
    setFrom(names[0]);
    setTo(names[1]);
    setSearch("");
  }
  function options() {
    return Object.entries(units).map(([symbol, unit]) => (
      <option key={symbol} value={symbol}>
        {symbol} — {unit.label}
      </option>
    ));
  }
  return (
    <section className="converter" aria-labelledby="converter-title">
      <div className="card converter-main">
        <div className="section-heading">
          <div>
            <p className="eyebrow">METRIC + IMPERIAL</p>
            <h2 id="converter-title">Engineering unit converter</h2>
          </div>
          <span className="converter-count">
            {QUANTITIES.length} quantities
          </span>
        </div>
        <label className="field converter-search">
          Find a quantity or unit
          <input
            type="search"
            placeholder="Try pressure, Fahrenheit, gallon…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {needle && (
          <div className="quantity-matches" aria-label="Matching quantities">
            {matches.length ? (
              matches.map((q) => (
                <button type="button" key={q} onClick={() => changeGroup(q)}>
                  {quantityLabel(q)}
                </button>
              ))
            ) : (
              <p role="status">No matching quantity. Choose one below.</p>
            )}
          </div>
        )}
        <div className="input-grid">
          <label className="field wide-field">
            Quantity
            <select
              value={group}
              onChange={(e) => changeGroup(e.target.value as UnitGroup)}
            >
              {QUANTITIES.map((q) => (
                <option key={q} value={q}>
                  {quantityLabel(q)}
                </option>
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
              aria-invalid={!!error}
              aria-describedby={error ? "conversion-error" : undefined}
            />
          </label>
          <label className="field">
            From unit
            <select value={from} onChange={(e) => setFrom(e.target.value)}>
              {options()}
            </select>
          </label>
          <label className="field">
            To unit
            <select value={to} onChange={(e) => setTo(e.target.value)}>
              {options()}
            </select>
          </label>
        </div>
        <div className="converter-actions">
          <button
            type="button"
            className="button subtle"
            onClick={() => {
              setFrom(to);
              setTo(from);
            }}
          >
            ⇄ Swap units
          </button>
          <span>Updates as you type</span>
        </div>
        <div className="converter-result" role="status">
          {error ? (
            <p id="conversion-error">{error}</p>
          ) : (
            <>
              <span>Converted value</span>
              <strong>
                {result} <small>{to}</small>
              </strong>
              <p>
                {value} {from} ≈ {result} {to}
              </p>
              <p className="conversion-rule">
                {conversionRule(group, from, to)}
              </p>
            </>
          )}
        </div>
        {QUANTITY_NOTES[group] && (
          <p className="conversion-note">{QUANTITY_NOTES[group]}</p>
        )}
        <p className="muted">
          Based on{" "}
          <a
            href="https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b8"
            target="_blank"
            rel="noreferrer"
          >
            NIST conversion definitions
          </a>
          . Display rounds to 12 significant digits. Results are not stored.
        </p>
      </div>
      <aside
        className="card conversion-equivalents"
        aria-labelledby="equivalents-title"
      >
        <p className="eyebrow">AT A GLANCE</p>
        <h2 id="equivalents-title">
          All {quantityLabel(group).toLowerCase()} units
        </h2>
        <p className="card-intro">
          The same input, in every available unit. Select a unit to use it as
          your destination.
        </p>
        <dl>
          {Object.entries(units).map(([symbol, unit]) => {
            let equivalent = "—";
            try {
              equivalent = formatConversion(
                convertUnits(value, group, from, symbol),
              );
            } catch {
              /* A target can overflow independently of the selected target. */
            }
            return (
              <div
                key={symbol}
                className={symbol === to ? "selected-equivalent" : ""}
              >
                <dt>
                  <button
                    type="button"
                    aria-label={`Convert to ${symbol}`}
                    aria-pressed={symbol === to}
                    onClick={() => setTo(symbol)}
                  >
                    {symbol}
                  </button>
                  <span>{unit.label}</span>
                </dt>
                <dd>{equivalent}</dd>
              </div>
            );
          })}
        </dl>
        <p className="muted">
          An em dash means the input is invalid or that conversion is outside
          the numeric range.
        </p>
      </aside>
    </section>
  );
}
