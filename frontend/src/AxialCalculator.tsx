import { useRef, useState, type FormEvent } from "react";
import {
  AXIAL_ASSUMPTIONS,
  AXIAL_EXAMPLE,
  AXIAL_FORMULA,
  AXIAL_LIMITATIONS,
  AXIAL_SOURCE,
  buildAxialReport,
  type AxialInputs,
  type AxialReport,
} from "./core/axialCalculator";
import {
  AXIAL_HISTORY_LIMIT,
  readAxialHistory,
  readRawAxialHistory,
  saveAxialReport,
} from "./axialHistory";
import { convertUnits, type ForceUnit } from "./units";

const fmt = (n: number) =>
  n !== 0 && Math.abs(n) < 0.001
    ? n.toExponential(4)
    : new Intl.NumberFormat(undefined, { maximumFractionDigits: 6 }).format(n);
const inputValues = (input: AxialInputs) => ({
  tensile_yield_strength_MPa: String(input.tensile_yield_strength_MPa),
  diameter_mm: String(input.diameter_mm),
  axial_force_N: String(input.axial_force_N),
  load_factor: String(input.load_factor),
});
const labels: Record<string, string> = {
  WITHIN_MODELED_YIELD: "Within modeled yield",
  AT_MODELED_YIELD: "At modeled yield",
  ABOVE_MODELED_YIELD: "Above modeled yield",
};
function download(text: string, filename: string) {
  const url = URL.createObjectURL(
    new Blob([text], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function snapshotRows(report: AxialReport) {
  return [
    [
      "Tensile yield strength",
      `${fmt(report.inputs.tensile_yield_strength_MPa)} MPa`,
    ],
    ["Original smooth diameter", `${fmt(report.inputs.diameter_mm)} mm`],
    ["Member axial force", `${fmt(report.inputs.axial_force_N)} N`],
    ["User load factor", `${fmt(report.inputs.load_factor)} ×`],
    ["Original area", `${fmt(report.result.original_area_mm2)} mm²`],
    ["Factored demand", `${fmt(report.result.factored_demand_N)} N`],
    ["Engineering stress", `${fmt(report.result.engineering_stress_MPa)} MPa`],
    ["Nominal yield load", `${fmt(report.result.nominal_yield_load_N)} N`],
    ["Demand / yield load", `${fmt(report.result.demand_ratio)}`],
    ["Model margin", `${fmt(report.result.model_margin)}`],
  ];
}

export function AxialCalculator() {
  const [values, setValues] = useState(() => inputValues(AXIAL_EXAMPLE));
  const [unit, setUnit] = useState<ForceUnit>("N");
  const [report, setReport] = useState<AxialReport | null>(null);
  const [baseline, setBaseline] = useState<AxialReport | null>(null);
  const [history, setHistory] = useState(() => readAxialHistory());
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  function change(key: keyof AxialInputs, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
    setStale(true);
    setError("");
  }
  function changeUnit(next: ForceUnit) {
    try {
      const raw = values.axial_force_N.trim()
        ? String(convertUnits(values.axial_force_N, "Force", unit, next))
        : "";
      setValues((current) => ({ ...current, axial_force_N: raw }));
      setUnit(next);
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function calculate(inputs: AxialInputs) {
    try {
      const next = buildAxialReport(inputs);
      setReport(next);
      setStale(false);
      setError("");
      setHistory(saveAxialReport(next));
      requestAnimationFrame(() =>
        heading.current?.focus({ preventScroll: true }),
      );
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      calculate({
        tensile_yield_strength_MPa: Number(values.tensile_yield_strength_MPa),
        diameter_mm: Number(values.diameter_mm),
        axial_force_N: convertUnits(values.axial_force_N, "Force", unit, "N"),
        load_factor: Number(values.load_factor),
      });
    } catch (cause) {
      setError((cause as Error).message);
    }
  }
  function example() {
    setValues(inputValues(AXIAL_EXAMPLE));
    setUnit("N");
    calculate(AXIAL_EXAMPLE);
  }
  function open(saved: AxialReport) {
    setValues(inputValues(saved.inputs));
    setUnit("N");
    setReport(saved);
    setStale(false);
    setError("");
    setHistory((current) => ({
      ...current,
      message: "Viewing the original axial snapshot. It was not recalculated.",
    }));
  }

  return (
    <div className="axial-module">
      <aside className="scope-note no-print">
        <span aria-hidden="true">ⓘ</span>
        <p>
          <strong>Member tension only.</strong> Smooth, solid, uniform round
          shank under concentric axial tension. Enter the force in this member;
          an external joint load is not automatically a bolt force.{" "}
          <a href="#axial-method">Model limits ↗</a>
        </p>
      </aside>
      <div className="main-grid">
        <section
          className="card input-card no-print"
          aria-labelledby="axial-inputs-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / DEFINE</p>
              <h2 id="axial-inputs-title">Axial tension inputs</h2>
            </div>
            <button className="text-button" onClick={example}>
              Run axial example
            </button>
          </div>
          <p className="card-intro">
            Illustrative values are supplied to explore the model. Verify every
            input for the actual material and section.
          </p>
          <form onSubmit={submit} noValidate>
            <div className="input-grid">
              <label className="field wide-field">
                Tensile yield strength (MPa)
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={values.tensile_yield_strength_MPa}
                  onChange={(e) =>
                    change("tensile_yield_strength_MPa", e.target.value)
                  }
                  aria-describedby="axial-fy-help"
                />
                <small id="axial-fy-help">
                  User verified for the material and condition; not ultimate
                  strength or an automatic grade property.
                </small>
              </label>
              <label className="field wide-field">
                Original smooth diameter (mm)
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={values.diameter_mm}
                  onChange={(e) => change("diameter_mm", e.target.value)}
                  aria-describedby="axial-d-help"
                />
                <small id="axial-d-help">
                  Solid circular section before deformation. Threads and reduced
                  sections are excluded.
                </small>
              </label>
              <div className="field wide-field">
                <div className="load-label">
                  <label htmlFor="axial-force">
                    Member axial force ({unit})
                  </label>
                  <label className="unit-select">
                    Unit
                    <select
                      aria-label="Axial force unit"
                      value={unit}
                      onChange={(e) => changeUnit(e.target.value as ForceUnit)}
                    >
                      <option>N</option>
                      <option>kN</option>
                    </select>
                  </label>
                </div>
                <input
                  id="axial-force"
                  type="number"
                  step="any"
                  min="0"
                  value={values.axial_force_N}
                  onChange={(e) => change("axial_force_N", e.target.value)}
                  aria-describedby="axial-load-help"
                />
                <small id="axial-load-help">
                  Positive tension carried by this section, before the chosen
                  factor. No preload or joint analysis.
                </small>
              </div>
              <label className="field wide-field">
                Axial load factor (×)
                <input
                  type="number"
                  step="any"
                  min="1"
                  value={values.load_factor}
                  onChange={(e) => change("load_factor", e.target.value)}
                  aria-describedby="axial-factor-help"
                />
                <small id="axial-factor-help">
                  User selected, at least 1.0. No code factor is prescribed.
                </small>
              </label>
            </div>
            <p className="form-message" role="alert">
              {error}
            </p>
            <div className="button-row">
              <button className="button primary" type="submit">
                Calculate axial estimate →
              </button>
              <button
                className="button secondary"
                type="button"
                onClick={() => {
                  setValues(inputValues(AXIAL_EXAMPLE));
                  setUnit("N");
                  setReport(null);
                  setStale(false);
                  setError("");
                }}
              >
                Reset axial inputs
              </button>
            </div>
            <p className="save-hint">
              Snapshots save to a separate axial history on this browser.
            </p>
          </form>
        </section>
        <section
          className="card report-card"
          aria-labelledby="axial-report-title"
        >
          {!report ? (
            <div className="empty-report">
              <p className="eyebrow">02 / UNDERSTAND</p>
              <div className="axial-diagram" aria-hidden="true">
                ← P <span>smooth shank</span> P →
              </div>
              <h2 id="axial-report-title">From force to axial stress.</h2>
              <p>
                Compare engineering stress over the original section with a
                supplied tensile yield value.
              </p>
              <div className="equation-preview">
                σ = P / A₀ <span>·</span> Pᵧ = Fᵧ A₀
              </div>
              <button className="button secondary" onClick={example}>
                Explore axial example →
              </button>
              <p className="muted">
                Conceptual illustration only. No joint geometry is analyzed.
              </p>
            </div>
          ) : (
            <article className="report axial-report">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">02 / UNDERSTAND</p>
                  <h2 id="axial-report-title" tabIndex={-1} ref={heading}>
                    Axial yield result
                  </h2>
                </div>
                <span
                  className={`status-chip ${report.result.status.toLowerCase()}`}
                >
                  {labels[report.result.status]}
                </span>
              </div>
              {stale && (
                <p className="stale-message" role="status">
                  Axial inputs changed. This snapshot is unchanged; calculate
                  again for a new result.
                </p>
              )}
              <div className="result-hero">
                <span>Nominal axial yield load</span>
                <strong>
                  {fmt(report.result.nominal_yield_load_N)} <small>N</small>
                </strong>
                <span className="capacity-newtons">
                  Original area × user-supplied tensile yield strength
                </span>
              </div>
              <div className="metric-grid">
                <div className="metric">
                  <span>Factored engineering stress</span>
                  <strong>
                    {fmt(report.result.engineering_stress_MPa)}{" "}
                    <small>MPa</small>
                  </strong>
                </div>
                <div className="metric">
                  <span>Model margin · Pᵧ/D − 1</span>
                  <strong>{fmt(report.result.model_margin)}</strong>
                </div>
              </div>
              <p className="result-boundary">
                Nominal yield is not a design allowable or connection approval.
                The supplied yield convention may represent an offset/proof
                value; exact plastic onset is not calculated.
              </p>
              <div className="report-actions no-print">
                <button
                  className="button secondary"
                  onClick={() =>
                    download(
                      JSON.stringify(report, null, 2),
                      `engcalc-axial-${report.report_id}.json`,
                    )
                  }
                >
                  Download axial JSON
                </button>
                <button
                  className="button secondary"
                  onClick={() => window.print()}
                >
                  Print axial report
                </button>
                <button
                  className="button secondary"
                  onClick={() => setBaseline(report)}
                >
                  {baseline?.report_id === report.report_id
                    ? "Axial baseline pinned"
                    : "Pin axial comparison"}
                </button>
              </div>
              <section className="input-snapshot">
                <h3>Evaluated inputs & results</h3>
                <dl>
                  {snapshotRows(report).map(([label, value]) => (
                    <div className="detail-row" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </section>
              <details className="calculation-steps">
                <summary>Axial equations & source</summary>
                <div className="formula-block">
                  <ul>
                    {Object.values(report.formula).map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  <p>{report.formula_source.derivation}</p>
                  <a
                    href={report.formula_source.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {report.formula_source.title} · MIT, pp. 1 and 3 ↗
                  </a>
                </div>
              </details>
              <p className="report-meta">
                Axial report · {report.report_id}
                <br />
                {new Date(report.created_at).toLocaleString()} · model{" "}
                {report.calculator_version}
                <br />
                Report schema {report.report_schema_version} · {report.model.id}
              </p>
              <div className="print-method">
                <h3>Assumptions & limitations</h3>
                <ul>
                  {[...report.assumptions, ...report.limitations].map(
                    (item) => (
                      <li key={item}>{item}</li>
                    ),
                  )}
                </ul>
                <p>
                  {report.formula_source.author}, {report.formula_source.title},{" "}
                  {report.formula_source.location}. {report.formula_source.url}
                </p>
                <p>{report.formula_source.derivation}</p>
              </div>
            </article>
          )}
        </section>
      </div>
      {baseline && (
        <section
          className="card comparison no-print"
          aria-labelledby="axial-compare-title"
        >
          <div className="section-heading">
            <div>
              <p className="eyebrow">03 / COMPARE</p>
              <h2 id="axial-compare-title">Axial scenario comparison</h2>
            </div>
            <button className="text-button" onClick={() => setBaseline(null)}>
              Clear axial comparison
            </button>
          </div>
          <p className="card-intro">
            Only axial snapshots are compared. The baseline lasts for this open
            session.
          </p>
          {report && report.report_id !== baseline.report_id ? (
            <div className="table-scroll">
              <table>
                <caption>Independent inputs, same axial model.</caption>
                <thead>
                  <tr>
                    <th>Quantity</th>
                    <th>
                      Pinned axial snapshot
                      <small>{baseline.report_id.slice(0, 8)}</small>
                    </th>
                    <th>
                      Current axial snapshot
                      <small>{report.report_id.slice(0, 8)}</small>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {snapshotRows(report).map(([label, value], i) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>{snapshotRows(baseline)[i][1]}</td>
                      <td>{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="comparison-empty">
              Change an axial input and calculate a second scenario.
            </p>
          )}
        </section>
      )}
      <section
        className="card history-card no-print"
        aria-labelledby="axial-history-title"
      >
        <div className="section-heading">
          <div>
            <p className="eyebrow">AXIAL WORK ONLY</p>
            <h2 id="axial-history-title">Saved axial reports</h2>
          </div>
          <span className="axial-history-count">
            {history.reports.length} / {AXIAL_HISTORY_LIMIT}
          </span>
        </div>
        <p className="card-intro">
          Separate from shear history. Open the original snapshot without
          recalculation. Export a copy before clearing browser data.
        </p>
        <p className="history-message" role="status">
          {history.message}
        </p>
        {(history.state === "corrupt" || history.state === "unsupported") && (
          <button
            className="button secondary"
            onClick={() => {
              const raw = readRawAxialHistory();
              if (raw !== null)
                download(raw, "engcalc-original-axial-history.json");
            }}
          >
            Download original axial history
          </button>
        )}
        {history.reports.length ? (
          <ol className="history-list">
            {history.reports.map((saved) => (
              <li key={saved.report_id}>
                <button
                  className={`history-item axial-history-item ${report?.report_id === saved.report_id ? "selected" : ""}`}
                  aria-pressed={report?.report_id === saved.report_id}
                  onClick={() => open(saved)}
                >
                  <span>
                    <strong>
                      Ø {fmt(saved.inputs.diameter_mm)} mm /{" "}
                      {fmt(saved.inputs.axial_force_N)} N
                    </strong>
                    <small>
                      {new Date(saved.created_at).toLocaleString()} ·{" "}
                      {saved.report_id.slice(0, 8)}
                    </small>
                  </span>
                  <span className="history-summary">
                    <strong>{fmt(saved.result.nominal_yield_load_N)} N</strong>
                    <small>nominal axial yield load</small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        ) : (
          <p className="history-empty">
            Your first axial calculation will appear here.
          </p>
        )}
      </section>
      <section className="card method-card no-print" id="axial-method">
        <div className="section-heading">
          <div>
            <p className="eyebrow">KNOW THE MODEL</p>
            <h2>Axial assumptions & limitations</h2>
          </div>
          <a href={AXIAL_SOURCE.url} target="_blank" rel="noreferrer">
            MIT source ↗
          </a>
        </div>
        <div className="method-grid">
          <div>
            <h3>Assumptions</h3>
            <ul>
              {AXIAL_ASSUMPTIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3>Limitations</h3>
            <ul>
              {AXIAL_LIMITATIONS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <details className="calculation-steps">
          <summary>Derivation and source</summary>
          <div className="formula-block">
            <ul>
              {Object.values(AXIAL_FORMULA).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <p>
              {AXIAL_SOURCE.author}, {AXIAL_SOURCE.title},{" "}
              {AXIAL_SOURCE.location}. {AXIAL_SOURCE.derivation}
            </p>
          </div>
        </details>
      </section>
    </div>
  );
}
