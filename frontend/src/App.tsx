import { useEffect, useMemo, useState, type FormEvent } from "react";
import { buildReport, type CalculationReport, type ShearInputs } from "./core/calculator";
import {
  MAX_HISTORY_REPORTS,
  readHistory,
  readStoredHistoryRaw,
  saveReport,
  type HistoryState,
} from "./history";
import {
  activateUpdateForNextNavigation,
  PWA_APP_VERSION,
  requestInstall,
  subscribePwaState,
  type PwaState,
} from "./pwa";

const EXAMPLE: ShearInputs = {
  tensile_yield_strength_MPa: 640,
  diameter_mm: 8,
  applied_shear_N: 10000,
  shear_planes: 1,
  fitting_factor: 1,
};
const MODEL_SOURCE = "https://web.mit.edu/course/3/3.11/www/modules/yield.pdf";

type FormValues = {
  tensile_yield_strength_MPa: string;
  diameter_mm: string;
  applied_shear_N: string;
  shear_planes: string;
  fitting_factor: string;
};

const toForm = (input: ShearInputs): FormValues => ({
  tensile_yield_strength_MPa: String(input.tensile_yield_strength_MPa),
  diameter_mm: String(input.diameter_mm),
  applied_shear_N: String(input.applied_shear_N),
  shear_planes: String(input.shear_planes ?? 1),
  fitting_factor: String(input.fitting_factor ?? 1),
});

const formatNumber = (value: number, digits = 3) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(value);
const formatResult = (value: number, digits = 2) =>
  value !== 0 && Math.abs(value) < 10 ** -digits ? value.toExponential(3) : formatNumber(value, digits);

const formatDate = (value: string) => new Date(value).toLocaleString();

function fromForm(values: FormValues): ShearInputs {
  return {
    tensile_yield_strength_MPa: Number(values.tensile_yield_strength_MPa),
    diameter_mm: Number(values.diameter_mm),
    applied_shear_N: Number(values.applied_shear_N),
    shear_planes: Number(values.shear_planes) as 1 | 2,
    fitting_factor: Number(values.fitting_factor),
  };
}

function historyMessage(state: HistoryState, detail: string): string {
  if (detail) return detail;
  if (state === "ready") return "";
  if (state === "corrupt") return "Saved history contains data this version cannot read. The original browser data was left untouched.";
  if (state === "unsupported") return "Saved history was made by an unsupported storage version. Its original data was left untouched.";
  return "This browser does not allow local history storage. You can still calculate, export, and print reports.";
}

function downloadReport(report: CalculationReport) {
  const safeId = report.report_id.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80) || "report";
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `engcalc-report-${safeId}.json`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadRawHistory() {
  const original = readStoredHistoryRaw();
  if (!original.ok) return original.message;
  const blob = new Blob([original.raw], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "engcalc-original-browser-history.json";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  return "Original stored history was downloaded without changing browser data.";
}

export default function App() {
  const [values, setValues] = useState<FormValues>(() => toForm(EXAMPLE));
  const [report, setReport] = useState<CalculationReport | null>(null);
  const [history, setHistory] = useState(() => readHistory());
  const [historyNotice, setHistoryNotice] = useState(() => historyMessage(history.state, history.message));
  const [historyWarning, setHistoryWarning] = useState(() => history.state !== "ready");
  const [formMessage, setFormMessage] = useState("");
  const [editedSinceReport, setEditedSinceReport] = useState(false);
  const [pwa, setPwa] = useState<PwaState>({ installAvailable: false, updateAvailable: false, offlineReady: false });
  const [installMessage, setInstallMessage] = useState("");

  useEffect(() => subscribePwaState(setPwa), []);

  const reportInputRows = useMemo(() => {
    if (!report) return [];
    return [
      ["Tensile yield strength", report.inputs.tensile_yield_strength],
      ["Unthreaded shank diameter", report.inputs.shank_diameter],
      ["Applied shear load", report.inputs.applied_shear_load],
      ["Shear planes", report.inputs.shear_planes],
      ["Load factor", report.inputs.load_factor],
    ] as const;
  }, [report]);

  function updateInput<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setEditedSinceReport(true);
    setFormMessage("");
  }

  function calculate(input: ShearInputs) {
    const planes = input.shear_planes ?? 1;
    const factor = input.fitting_factor ?? 1;
    const normalized: ShearInputs = {
      ...input,
      shear_planes: planes,
      fitting_factor: factor,
    };
    const numericValues = [normalized.tensile_yield_strength_MPa, normalized.diameter_mm, normalized.applied_shear_N, factor];
    if (numericValues.some((value) => !Number.isFinite(value) || value <= 0)) {
      setFormMessage("Strength, diameter, load, and load factor must be finite positive numbers.");
      return;
    }
    if (factor < 1) {
      setFormMessage("Load factor must be at least 1.0.");
      return;
    }
    if (planes !== 1 && planes !== 2) {
      setFormMessage("Choose one or two shear planes.");
      return;
    }

    try {
      const nextReport = buildReport(normalized);
      setReport(nextReport);
      setEditedSinceReport(false);
      setFormMessage("");
      const saved = saveReport(nextReport);
      setHistory((current) => ({
        ...current,
        reports: saved.reports,
        state: saved.ok ? "ready" : saved.state === "full" || saved.state === "quota" ? current.state : saved.state,
      }));
      setHistoryNotice(saved.ok
        ? (saved.alreadySaved ? "This report is already saved on this device." : "Report saved in this browser on this device.")
        : saved.message);
      setHistoryWarning(!saved.ok);
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "These values are outside the supported calculation range.");
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    calculate(fromForm(values));
  }

  function runExample() {
    setValues(toForm(EXAMPLE));
    calculate(EXAMPLE);
  }

  function resetInputs() {
    setValues(toForm(EXAMPLE));
    setReport(null);
    setEditedSinceReport(false);
    setFormMessage("");
    setInstallMessage("");
  }

  function selectSavedReport(saved: CalculationReport) {
    setValues(toForm({
      tensile_yield_strength_MPa: saved.inputs.tensile_yield_strength.value,
      diameter_mm: saved.inputs.shank_diameter.value,
      applied_shear_N: saved.inputs.applied_shear_load.value,
      shear_planes: saved.inputs.shear_planes.value as 1 | 2,
      fitting_factor: saved.inputs.load_factor.value,
    }));
    setReport(saved);
    setEditedSinceReport(false);
    setFormMessage("");
    setHistoryNotice("Viewing a saved snapshot. It was not recalculated.");
    setHistoryWarning(false);
  }

  async function installApp() {
    const result = await requestInstall();
    setInstallMessage(result === "accepted"
      ? "EngCalc was added to this device."
      : result === "dismissed" ? "Installation was dismissed." : "Your browser does not currently offer installation.");
  }

  const statusLabel = report ? ({
    WITHIN_MODELED_YIELD: "Within modeled yield",
    AT_MODELED_YIELD: "At modeled yield",
    ABOVE_MODELED_YIELD: "Above modeled yield",
  }[report.result.status] ?? "Model result") : "";

  return (
    <main className="app-shell">
      <header className="app-header">
        <a className="brand" href="#top" aria-label="EngCalc home"><span className="brand-mark" aria-hidden="true">E</span><span>EngCalc</span></a>
        <div className="header-versions" aria-label="Version information"><span>Web app v{PWA_APP_VERSION}</span><span>Calculator model v{report?.calculator_version ?? "1.0.0"}</span></div>
      </header>

      <section className="hero" id="top" aria-labelledby="page-title">
        <p className="eyebrow">Learning model · Bolt shear</p>
        <h1 id="page-title">Estimate bolt-shank shear yield</h1>
        <p className="intro">Explore an idealized pure-shear model with a tensile yield value you provide. Every report keeps its inputs, units, assumptions, source, and model version.</p>
        <aside className="education-notice" role="note">
          <span aria-hidden="true">ⓘ</span>
          <p><strong>Educational estimate only</strong>This is not a design allowable, safety certification, or approval. It excludes several failure modes; assess the actual connection and material with a qualified engineer.</p>
        </aside>
        <p className="local-notice">Reports are stored only in this browser on this device. They are not uploaded or cloud-synced. Clearing this browser's site data, using a different browser, or switching devices removes access to this local history.</p>
        {(pwa.installAvailable || pwa.updateAvailable || pwa.offlineReady) && (
          <div className="pwa-tools" aria-label="App availability">
            {pwa.installAvailable && <button className="button subtle" onClick={installApp}>Install app</button>}
            {pwa.updateAvailable && <button className="button subtle" onClick={activateUpdateForNextNavigation}>Use update on next navigation</button>}
            {pwa.offlineReady && <span className="offline-ready">Available offline after this visit</span>}
          </div>
        )}
        {installMessage && <p className="helper-message" role="status">{installMessage}</p>}
      </section>

      <div className="main-grid">
        <section className="card input-card" aria-labelledby="inputs-title">
          <div className="section-heading">
            <div><p className="eyebrow">Inputs</p><h2 id="inputs-title">Calculation inputs</h2></div>
            <span className="step-pill">1 / 2</span>
          </div>
          <p className="card-intro">Enter nominal tensile yield strength from a source verified for the material and condition.</p>
          <form onSubmit={submit} noValidate>
            <div className="input-grid">
              <label className="field wide-field">
                <span>Tensile yield strength <span className="unit">(MPa)</span></span>
                <input type="number" inputMode="decimal" min="0" step="any" required value={values.tensile_yield_strength_MPa} onChange={(event) => updateInput("tensile_yield_strength_MPa", event.target.value)} aria-describedby="fy-help" />
                <small id="fy-help">User supplied. This tool does not identify or verify a fastener grade.</small>
              </label>
              <label className="field">
                <span>Unthreaded shank diameter <span className="unit">(mm)</span></span>
                <input type="number" inputMode="decimal" min="0" step="any" required value={values.diameter_mm} onChange={(event) => updateInput("diameter_mm", event.target.value)} aria-describedby="diameter-help" />
                <small id="diameter-help">Use the diameter where the shear plane crosses the shank.</small>
              </label>
              <label className="field">
                <span>Applied shear load <span className="unit">(N)</span></span>
                <input type="number" inputMode="decimal" min="0" step="any" required value={values.applied_shear_N} onChange={(event) => updateInput("applied_shear_N", event.target.value)} aria-describedby="load-help" />
                <small id="load-help">Total applied load before the selected factor.</small>
              </label>
              <label className="field">
                <span>Shear planes <span className="unit">(count)</span></span>
                <select value={values.shear_planes} onChange={(event) => updateInput("shear_planes", event.target.value)} aria-describedby="planes-help">
                  <option value="1">1 · single shear</option><option value="2">2 · double shear</option>
                </select>
                <small id="planes-help">Assumes equal load sharing between planes.</small>
              </label>
              <label className="field">
                <span>Load factor <span className="unit">(dimensionless)</span></span>
                <input type="number" inputMode="decimal" min="1" step="any" required value={values.fitting_factor} onChange={(event) => updateInput("fitting_factor", event.target.value)} aria-describedby="factor-help" />
                <small id="factor-help">User selected, multiplies applied load; minimum 1.0.</small>
              </label>
            </div>
            <div className="button-row">
              <button className="button primary" type="submit">Calculate estimate</button>
              <button className="button secondary" type="button" onClick={runExample}>Run example</button>
              <button className="button secondary" type="button" onClick={resetInputs}>Reset</button>
            </div>
            <p className="form-message" role="alert" aria-live="polite">{formMessage}</p>
          </form>
        </section>

        <section className="card report-card" aria-labelledby="report-title" aria-live="polite">
          {!report ? (
            <div className="empty-report"><span className="empty-icon" aria-hidden="true">↗</span><h2 id="report-title">Your report will appear here</h2><p>Run the example or enter values to create a versioned calculation report.</p></div>
          ) : (
            <article className="report" aria-labelledby="report-title">
              <div className="report-heading">
                <div><p className="eyebrow">Report · {report.report_schema_version}</p><h2 id="report-title">Bolt-shank shear yield</h2><p className="report-meta">Generated in this browser; not on a server.<br />{report.report_id}<br />{formatDate(report.created_at)} · calculator v{report.calculator_version}</p></div>
                <span className={`status-chip ${report.result.status.toLowerCase()}`}>{statusLabel}</span>
              </div>
              {editedSinceReport && <p className="stale-message" role="status">Inputs changed. This report remains the same snapshot; calculate again to make a new report.</p>}
              <section className="input-snapshot" aria-label="Saved report input snapshot">
                <h3>Input snapshot</h3>
                <dl>{reportInputRows.map(([label, quantity]) => <div className="detail-row" key={label}><dt>{label}</dt><dd>{String(quantity.value)} {quantity.unit}</dd></div>)}</dl>
              </section>
              <div className="metric-grid">
                <div className="metric"><span>Model margin <small>(capacity / demand - 1)</small></span><strong>{report.result.margin_of_safety >= 0 ? "+" : ""}{formatResult(report.result.margin_of_safety, 6)} <small>ratio</small></strong></div>
                <div className="metric"><span>Nominal yield capacity <small>(N)</small></span><strong>{formatResult(report.result.total_nominal_yield_capacity_N, 2)} <small>N</small></strong></div>
              </div>
              <dl className="report-details">
                <div className="detail-row"><dt>Von Mises pure-shear yield</dt><dd>{formatResult(report.intermediates.von_mises_shear_yield_strength.value, 3)} MPa</dd></div>
                <div className="detail-row"><dt>Full circular shank area</dt><dd>{formatResult(report.intermediates.full_circular_shank_area.value, 3)} mm²</dd></div>
                <div className="detail-row"><dt>Capacity per shear plane</dt><dd>{formatResult(report.intermediates.nominal_yield_capacity_per_plane.value, 2)} N</dd></div>
                <div className="detail-row"><dt>Factored total applied load</dt><dd>{formatResult(report.result.factored_applied_load_N, 2)} N</dd></div>
                <div className="detail-row"><dt>Factored load per plane</dt><dd>{formatResult(report.intermediates.factored_applied_load_per_plane.value, 2)} N</dd></div>
              </dl>
              <div className="formula-block"><h3>Model equations</h3><ul>
                <li>{report.formula.shear_yield_strength}</li><li>{report.formula.shank_area}</li>
                <li>{report.formula.total_nominal_yield_capacity}</li><li>{report.formula.factored_demand}</li>
                <li>{report.formula.margin_of_safety}</li><li>{report.formula.unit_note}</li>
              </ul></div>
              <details className="assumptions" open><summary>Assumptions and limitations</summary><h3>Assumptions</h3><ul>{report.assumptions.map((item, index) => <li key={`a-${index}`}>{item}</li>)}</ul><h3>Limitations</h3><ul>{report.limitations.map((item, index) => <li key={`l-${index}`}>{item}</li>)}</ul></details>
              <p className="source-line">Formula source: {report.formula_source.author}, {report.formula_source.title}, {report.formula_source.location}. <a href={MODEL_SOURCE} target="_blank" rel="noreferrer">Read the MIT source</a></p>
              <div className="report-actions no-print"><button className="button secondary" type="button" onClick={() => downloadReport(report)}>Download report JSON</button><button className="button secondary" type="button" onClick={() => window.print()}>Print report</button></div>
            </article>
          )}
        </section>
      </div>

      <section className="card history-card" aria-labelledby="history-title">
        <div className="section-heading">
          <div><p className="eyebrow">This device only</p><h2 id="history-title">Saved report history</h2></div>
          <span className="history-count">{history.reports.length} / {MAX_HISTORY_REPORTS}</span>
        </div>
        <p className="card-intro">Selecting a saved report opens its original snapshot. It does not recalculate from current inputs.</p>
        {historyNotice && <p className={`history-message ${historyWarning ? "warning" : "info"}`} role="status">{historyNotice}</p>}
        {(history.state === "corrupt" || history.state === "unsupported") && <button className="button secondary recovery-button" type="button" onClick={() => { setHistoryNotice(downloadRawHistory()); setHistoryWarning(true); }}>Download original history data</button>}
        {history.reports.length === 0 ? <p className="history-empty">New calculations are saved here when this browser allows local storage.</p> : (
          <ol className="history-list">
            {history.reports.map((saved) => (
              <li key={saved.report_id}>
                <button type="button" className={`history-item ${report?.report_id === saved.report_id ? "selected" : ""}`} onClick={() => selectSavedReport(saved)} aria-pressed={report?.report_id === saved.report_id}>
                  <span><strong>{formatDate(saved.created_at)}</strong><small>{saved.report_id}</small></span>
                  <span className="history-summary">{formatResult(saved.result.total_nominal_yield_capacity_N, 2)} N capacity<br />{saved.inputs.shear_planes.value} shear plane{saved.inputs.shear_planes.value === 1 ? "" : "s"}</span>
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <footer className="app-footer">
        <p><strong>Model boundary:</strong> static, concentric pure shear; ductile isotropic material; smooth unthreaded full shank; equal plane sharing.</p>
        <p>Not modeled: ultimate failure, threads, bearing, tear-out, slip, preload, fatigue, eccentricity, bending, or combined loading.</p>
      </footer>
    </main>
  );
}
