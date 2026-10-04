import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  buildReport,
  type CalculationReport,
  type ShearInputs,
} from "./core/calculator";
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

import { convertUnits, type ForceUnit } from "./units";
import { UnitConverter } from "./UnitConverter";
import { AxialCalculator } from "./AxialCalculator";

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
  new Intl.NumberFormat(undefined, { maximumFractionDigits: digits }).format(
    value,
  );
const formatResult = (value: number, digits = 2) =>
  value !== 0 && Math.abs(value) < 10 ** -digits
    ? value.toExponential(3)
    : formatNumber(value, digits);

const formatDate = (value: string) => new Date(value).toLocaleString();

function fromForm(values: FormValues, unit: ForceUnit): ShearInputs {
  return {
    tensile_yield_strength_MPa: Number(values.tensile_yield_strength_MPa),
    diameter_mm: Number(values.diameter_mm),
    applied_shear_N: convertUnits(values.applied_shear_N, "Force", unit, "N"),
    shear_planes: Number(values.shear_planes) as 1 | 2,
    fitting_factor: Number(values.fitting_factor),
  };
}

function historyMessage(state: HistoryState, detail: string): string {
  if (detail) return detail;
  if (state === "ready") return "";
  if (state === "corrupt")
    return "Saved history contains data this version cannot read. The original browser data was left untouched.";
  if (state === "unsupported")
    return "Saved history was made by an unsupported storage version. Its original data was left untouched.";
  return "This browser does not allow local history storage. You can still calculate, export, and print reports.";
}

function downloadReport(report: CalculationReport) {
  const safeId =
    report.report_id.replace(/[^a-zA-Z0-9-]/g, "-").slice(0, 80) || "report";
  const blob = new Blob([JSON.stringify(report, null, 2)], {
    type: "application/json",
  });
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
  const [module, setModule] = useState<"bolt" | "units" | "axial">("bolt");
  const moduleInfo = {
    bolt: {
      category: "01 / FASTENER MECHANICS",
      title: "Bolt-shank shear yield",
      description:
        "Understand the load. See the calculation. Compare your options.",
    },
    units: {
      category: "02 / ENGINEERING ESSENTIALS",
      title: "Engineering unit conversions",
      description:
        "Metric and imperial units across mechanics, fluids, thermal quantities and more.",
    },
    axial: {
      category: "03 / MEMBER MECHANICS",
      title: "Round-shank axial yield",
      description:
        "Explore uniform tensile stress and a nominal material-yield boundary.",
    },
  }[module];
  const [loadUnit, setLoadUnit] = useState<ForceUnit>("N");
  const [baseline, setBaseline] = useState<CalculationReport | null>(null);
  const reportHeading = useRef<HTMLHeadingElement>(null);
  const [values, setValues] = useState<FormValues>(() => toForm(EXAMPLE));
  const [report, setReport] = useState<CalculationReport | null>(null);
  const [history, setHistory] = useState(() => readHistory());
  const [historyNotice, setHistoryNotice] = useState(() =>
    historyMessage(history.state, history.message),
  );
  const [historyWarning, setHistoryWarning] = useState(
    () => history.state !== "ready",
  );
  const [formMessage, setFormMessage] = useState("");
  const [editedSinceReport, setEditedSinceReport] = useState(false);
  const [pwa, setPwa] = useState<PwaState>({
    installAvailable: false,
    updateAvailable: false,
    offlineReady: false,
  });
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

  function updateInput<K extends keyof FormValues>(
    key: K,
    value: FormValues[K],
  ) {
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
    const numericValues = [
      normalized.tensile_yield_strength_MPa,
      normalized.diameter_mm,
      normalized.applied_shear_N,
      factor,
    ];
    if (numericValues.some((value) => !Number.isFinite(value) || value <= 0)) {
      setFormMessage(
        "Strength, diameter, load, and load factor must be finite positive numbers.",
      );
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
      requestAnimationFrame(() =>
        reportHeading.current?.focus({ preventScroll: true }),
      );
      setEditedSinceReport(false);
      setFormMessage("");
      const saved = saveReport(nextReport);
      setHistory((current) => ({
        ...current,
        reports: saved.reports,
        state: saved.ok
          ? "ready"
          : saved.state === "full" || saved.state === "quota"
            ? current.state
            : saved.state,
      }));
      setHistoryNotice(
        saved.ok
          ? saved.alreadySaved
            ? "This report is already saved on this device."
            : "Report saved in this browser on this device."
          : saved.message,
      );
      setHistoryWarning(!saved.ok);
    } catch (error) {
      setFormMessage(
        error instanceof Error
          ? error.message
          : "These values are outside the supported calculation range.",
      );
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      calculate(fromForm(values, loadUnit));
    } catch (error) {
      setFormMessage((error as Error).message);
    }
  }

  function runExample() {
    setLoadUnit("N");
    setValues(toForm(EXAMPLE));
    calculate(EXAMPLE);
  }

  function resetInputs() {
    setLoadUnit("N");
    setValues(toForm(EXAMPLE));
    setReport(null);
    setEditedSinceReport(false);
    setFormMessage("");
    setInstallMessage("");
  }

  function selectSavedReport(saved: CalculationReport) {
    setModule("bolt");
    setLoadUnit("N");
    setValues(
      toForm({
        tensile_yield_strength_MPa: saved.inputs.tensile_yield_strength.value,
        diameter_mm: saved.inputs.shank_diameter.value,
        applied_shear_N: saved.inputs.applied_shear_load.value,
        shear_planes: saved.inputs.shear_planes.value as 1 | 2,
        fitting_factor: saved.inputs.load_factor.value,
      }),
    );
    setReport(saved);
    setEditedSinceReport(false);
    setFormMessage("");
    setHistoryNotice("Viewing a saved snapshot. It was not recalculated.");
    setHistoryWarning(false);
  }

  async function installApp() {
    const result = await requestInstall();
    setInstallMessage(
      result === "accepted"
        ? "EngCalc was added to this device."
        : result === "dismissed"
          ? "Installation was dismissed."
          : "Your browser does not currently offer installation.",
    );
  }

  const statusLabel = report
    ? ({
        WITHIN_MODELED_YIELD: "Within modeled yield",
        AT_MODELED_YIELD: "At modeled yield",
        ABOVE_MODELED_YIELD: "Above modeled yield",
      }[report.result.status] ?? "Model result")
    : "";

  const capacity = report?.result.total_nominal_yield_capacity_N ?? 0;
  const demand = report?.result.factored_applied_load_N ?? 0;
  const demandRatio = capacity > 0 ? demand / capacity : 0;
  const demandPercent = demandRatio * 100;
  const percentLabel = Number.isFinite(demandPercent)
    ? `${formatResult(demandPercent, 1)}%`
    : "> 1e308%";
  function changeUnit(next: ForceUnit) {
    try {
      const converted = values.applied_shear_N.trim()
        ? String(convertUnits(values.applied_shear_N, "Force", loadUnit, next))
        : "";
      setValues((current) => ({ ...current, applied_shear_N: converted }));
      setLoadUnit(next);
    } catch (error) {
      setFormMessage((error as Error).message);
    }
  }
  const comparisonRows = (item: CalculationReport) => [
    `${formatResult(item.inputs.tensile_yield_strength.value)} MPa`,
    `${formatResult(item.inputs.shank_diameter.value)} mm`,
    `${formatResult(item.inputs.applied_shear_load.value / 1000)} kN`,
    `${item.inputs.shear_planes.value}`,
    `${item.inputs.load_factor.value}`,
    `${formatResult(item.result.total_nominal_yield_capacity_N / 1000)} kN`,
    `${formatResult(item.result.factored_applied_load_N / 1000)} kN`,
    `${formatResult(item.result.margin_of_safety, 6)}`,
  ];

  return (
    <div className="app-shell" id="top">
      <a className="skip-link" href="#workspace">
        Skip to calculator
      </a>
      <aside className="sidebar no-print">
        <a className="brand" href="#top" aria-label="EngCalc home">
          <span className="brand-mark">
            E<span>∕</span>
          </span>
          EngCalc
        </a>
        <p className="sidebar-caption">The engineering workbench</p>
        <p className="nav-label">YOUR TOOLS</p>
        <nav aria-label="Calculation modules">
          <button
            className={`nav-item ${module === "bolt" ? "active" : ""}`}
            aria-pressed={module === "bolt"}
            onClick={() => setModule("bolt")}
          >
            <span aria-hidden="true">⌖</span>
            <span>
              Bolt shear<small>Idealized yield model</small>
            </span>
            <span className="nav-arrow">↗</span>
          </button>
          <button
            className={`nav-item ${module === "units" ? "active" : ""}`}
            aria-pressed={module === "units"}
            onClick={() => setModule("units")}
          >
            <span aria-hidden="true">⇄</span>
            <span>
              Unit converter<small>20 quantities · metric + imperial</small>
            </span>
            <span className="nav-arrow">↗</span>
          </button>
          <button
            className={`nav-item ${module === "axial" ? "active" : ""}`}
            aria-pressed={module === "axial"}
            onClick={() => setModule("axial")}
          >
            <span aria-hidden="true">↔</span>
            <span>
              Axial yield<small>Smooth round member</small>
            </span>
            <span className="nav-arrow">↗</span>
          </button>
        </nav>
        <a className="catalogue-link" href="#module-catalogue">
          Explore the module roadmap →
        </a>
        <div className="sidebar-bottom">
          <strong>Local by design</strong>
          <p>Calculations run on your device. No account. No upload.</p>
          <span>Web app v{PWA_APP_VERSION}</span>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="topbar no-print">
          <span>
            WORKSPACE{" "}
            <span className="breadcrumb">
              /{" "}
              {module === "bolt"
                ? "Fasteners"
                : module === "axial"
                  ? "Members"
                  : "Essentials"}
            </span>
          </span>
          <div className="pwa-tools">
            {pwa.offlineReady && (
              <span className="offline-ready">
                Available offline after this visit
              </span>
            )}
            {pwa.installAvailable && (
              <button className="button subtle" onClick={installApp}>
                Install app
              </button>
            )}
            {pwa.updateAvailable && (
              <button
                className="button subtle"
                onClick={activateUpdateForNextNavigation}
              >
                Use update on next navigation
              </button>
            )}
          </div>
        </header>
        <main id="workspace">
          <section className="page-heading no-print">
            <div>
              <p className="eyebrow">{moduleInfo.category}</p>
              <h1>{moduleInfo.title}</h1>
              <p>{moduleInfo.description}</p>
            </div>
            <span className="model-tag">
              {module !== "units"
                ? "Educational model · v1.0.0"
                : "20 engineering quantities"}
            </span>
          </section>
          {installMessage && (
            <p role="status" className="helper-message">
              {installMessage}
            </p>
          )}
          <div hidden={module !== "units"} className="no-print">
            <UnitConverter />
          </div>
          <div id="shear-panel" hidden={module !== "bolt"}>
            <aside className="scope-note no-print">
              <span aria-hidden="true">ⓘ</span>
              <p>
                <strong>A model, with a clear boundary.</strong> Smooth shank ·
                static pure shear · equal plane sharing. Educational estimate
                only; not a code design check or approval.{" "}
                <a href="#method">See assumptions ↗</a>
              </p>
            </aside>
            <div className="main-grid">
              <section
                className="card input-card no-print"
                aria-labelledby="inputs-title"
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">01 / DEFINE</p>
                    <h2 id="inputs-title">Calculation inputs</h2>
                  </div>
                  <button
                    className="text-button"
                    type="button"
                    onClick={runExample}
                  >
                    Run example
                  </button>
                </div>
                <p className="card-intro">
                  Start with the illustrative values, or enter your own verified
                  inputs.
                </p>
                <form onSubmit={submit} noValidate>
                  <div className="input-grid">
                    <label className="field wide-field">
                      <span>
                        Tensile yield strength{" "}
                        <span className="unit">(MPa)</span>
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        required
                        value={values.tensile_yield_strength_MPa}
                        onChange={(e) =>
                          updateInput(
                            "tensile_yield_strength_MPa",
                            e.target.value,
                          )
                        }
                        aria-describedby="fy-help"
                      />
                      <small id="fy-help">
                        Use a verified value for the material and condition. No
                        grade lookup.
                      </small>
                    </label>
                    <label className="field wide-field">
                      <span>
                        Unthreaded shank diameter{" "}
                        <span className="unit">(mm)</span>
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        required
                        value={values.diameter_mm}
                        onChange={(e) =>
                          updateInput("diameter_mm", e.target.value)
                        }
                        aria-describedby="diameter-help"
                      />
                      <small id="diameter-help">
                        Smooth diameter at the shear plane. Threads are
                        excluded.
                      </small>
                    </label>
                    <div className="field wide-field">
                      <div className="load-label">
                        <label htmlFor="load">
                          Applied shear load ({loadUnit})
                        </label>
                        <label className="unit-select">
                          Unit
                          <select
                            aria-label="Load unit"
                            value={loadUnit}
                            onChange={(e) =>
                              changeUnit(e.target.value as ForceUnit)
                            }
                          >
                            <option>N</option>
                            <option>kN</option>
                          </select>
                        </label>
                      </div>
                      <input
                        id="load"
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step="any"
                        required
                        value={values.applied_shear_N}
                        onChange={(e) =>
                          updateInput("applied_shear_N", e.target.value)
                        }
                        aria-describedby="load-help"
                      />
                      <small id="load-help">
                        Total load before factor. 1 kN = 1,000 N.
                      </small>
                    </div>
                    <label className="field">
                      <span>
                        Shear planes <span className="unit">(count)</span>
                      </span>
                      <select
                        value={values.shear_planes}
                        onChange={(e) =>
                          updateInput("shear_planes", e.target.value)
                        }
                        aria-describedby="planes-help"
                      >
                        <option value="1">1 · single shear</option>
                        <option value="2">2 · double shear</option>
                      </select>
                      <small id="planes-help">
                        Equal sharing at each plane.
                      </small>
                    </label>
                    <label className="field">
                      <span>
                        Load factor <span className="unit">(×)</span>
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="1"
                        step="any"
                        required
                        value={values.fitting_factor}
                        onChange={(e) =>
                          updateInput("fitting_factor", e.target.value)
                        }
                        aria-describedby="factor-help"
                      />
                      <small id="factor-help">
                        User selected; minimum 1.0.
                      </small>
                    </label>
                  </div>
                  <p className="form-message" role="alert">
                    {formMessage}
                  </p>
                  <div className="button-row">
                    <button className="button primary" type="submit">
                      Calculate estimate <span aria-hidden="true">→</span>
                    </button>
                    <button
                      className="button secondary"
                      type="button"
                      onClick={resetInputs}
                    >
                      Reset
                    </button>
                  </div>
                  <p className="save-hint">
                    Each calculation saves a snapshot when local storage is
                    available.
                  </p>
                </form>
              </section>

              <section
                className="card report-card"
                aria-labelledby="report-title"
              >
                {!report ? (
                  <div className="empty-report">
                    <p className="eyebrow">02 / UNDERSTAND</p>
                    <div className="shank-diagram" aria-hidden="true">
                      <div className="force-arrow">V →</div>
                      <div className="shank">
                        <span></span>
                      </div>
                      <div className="force-arrow reverse">← V</div>
                      <span className="plane-line"></span>
                      <span className="plane-caption">shear plane</span>
                    </div>
                    <h2 id="report-title">Your result, with the math.</h2>
                    <p>
                      Calculate to see nominal yield capacity, factored demand,
                      and the margin between them.
                    </p>
                    <div className="equation-preview">
                      τᵧ = Fᵧ / √3 <span>·</span> A = πd² / 4
                    </div>
                    <button className="button secondary" onClick={runExample}>
                      Explore the worked example →
                    </button>
                    <p className="muted">
                      Illustration is conceptual; no joint geometry is analyzed.
                    </p>
                  </div>
                ) : (
                  <article className="report">
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">02 / UNDERSTAND</p>
                        <h2 id="report-title" tabIndex={-1} ref={reportHeading}>
                          Calculation result
                        </h2>
                      </div>
                      <span
                        className={`status-chip ${report.result.status.toLowerCase()}`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    {editedSinceReport && (
                      <p className="stale-message" role="status">
                        Inputs changed. This report remains the same snapshot;
                        calculate again to make a new report.
                      </p>
                    )}
                    <div className="result-hero">
                      <span>Nominal yield capacity</span>
                      <strong>
                        {formatResult(capacity / 1000, 3)} <small>kN</small>
                      </strong>
                      <span className="capacity-newtons">
                        {formatResult(capacity, 2)} N ·{" "}
                        {report.inputs.shear_planes.value} shear plane
                        {report.inputs.shear_planes.value === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="metric-grid">
                      <div className="metric">
                        <span>Factored demand</span>
                        <strong>
                          {formatResult(demand / 1000, 3)} <small>kN</small>
                        </strong>
                      </div>
                      <div className="metric">
                        <span>Model margin · C/D − 1</span>
                        <strong>
                          {report.result.margin_of_safety >= 0 ? "+" : ""}
                          {formatResult(report.result.margin_of_safety, 6)}
                        </strong>
                      </div>
                    </div>
                    <div
                      className="demand-chart"
                      role="img"
                      aria-label={`Demand is ${percentLabel} of nominal modeled capacity`}
                    >
                      <div className="chart-label">
                        <span>Demand / modeled capacity</span>
                        <strong>{percentLabel}</strong>
                      </div>
                      <div className="chart-track">
                        <span
                          style={{
                            width: `${Math.min(100, demandRatio * 100)}%`,
                          }}
                          className={
                            report.result.status === "ABOVE_MODELED_YIELD"
                              ? "above"
                              : ""
                          }
                        ></span>
                      </div>
                      <div className="chart-scale">
                        <span>0</span>
                        <span>Modeled yield boundary · 100%</span>
                      </div>
                    </div>
                    <p className="result-boundary">
                      This status describes the idealized yield model only. It
                      does not establish connection safety or a design
                      allowable.
                    </p>
                    <div className="report-actions no-print">
                      <button
                        className="button secondary"
                        onClick={() => downloadReport(report)}
                      >
                        Download report JSON
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => window.print()}
                      >
                        Print report
                      </button>
                      <button
                        className="button secondary"
                        onClick={() => setBaseline(report)}
                      >
                        {baseline?.report_id === report.report_id
                          ? "Baseline pinned"
                          : "Pin as comparison"}
                      </button>
                    </div>
                    <section
                      className="input-snapshot"
                      aria-label="Saved report input snapshot"
                    >
                      <h3>Evaluated inputs</h3>
                      <dl>
                        {reportInputRows.map(([label, quantity]) => (
                          <div className="detail-row" key={label}>
                            <dt>{label}</dt>
                            <dd>
                              {String(quantity.value)} {quantity.unit}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </section>
                    <details className="calculation-steps">
                      <summary>Calculation steps & report identity</summary>
                      <dl className="report-details">
                        <div className="detail-row">
                          <dt>Von Mises pure-shear yield</dt>
                          <dd>
                            {formatResult(
                              report.intermediates
                                .von_mises_shear_yield_strength.value,
                              3,
                            )}{" "}
                            MPa
                          </dd>
                        </div>
                        <div className="detail-row">
                          <dt>Full circular shank area</dt>
                          <dd>
                            {formatResult(
                              report.intermediates.full_circular_shank_area
                                .value,
                              3,
                            )}{" "}
                            mm²
                          </dd>
                        </div>
                        <div className="detail-row">
                          <dt>Capacity per plane</dt>
                          <dd>
                            {formatResult(
                              report.intermediates
                                .nominal_yield_capacity_per_plane.value,
                            )}{" "}
                            N
                          </dd>
                        </div>
                        <div className="detail-row">
                          <dt>Factored load per plane</dt>
                          <dd>
                            {formatResult(
                              report.intermediates
                                .factored_applied_load_per_plane.value,
                            )}{" "}
                            N
                          </dd>
                        </div>
                      </dl>
                      <div className="formula-block">
                        <h3>Model equations</h3>
                        <ul>
                          {Object.values(report.formula).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      </div>
                    </details>
                    <p className="report-meta">
                      Generated in this browser; not on a server.
                      <br />
                      {report.report_id}
                      <br />
                      {formatDate(report.created_at)} · calculator v
                      {report.calculator_version} · report schema{" "}
                      {report.report_schema_version}
                    </p>
                    <div className="print-method">
                      <h3>Assumptions and limitations</h3>
                      <ul>
                        {[...report.assumptions, ...report.limitations].map(
                          (item) => (
                            <li key={item}>{item}</li>
                          ),
                        )}
                      </ul>
                      <p>
                        Formula source: {report.formula_source.author},{" "}
                        {report.formula_source.title},{" "}
                        {report.formula_source.location}.{" "}
                        {report.formula_source.url}
                      </p>
                    </div>
                  </article>
                )}
              </section>
            </div>

            {baseline && (
              <section
                className="card comparison no-print"
                aria-labelledby="comparison-title"
              >
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">03 / COMPARE</p>
                    <h2 id="comparison-title">Scenario comparison</h2>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => setBaseline(null)}
                  >
                    Clear comparison
                  </button>
                </div>
                <p className="card-intro">
                  Baseline pinned for this session. Change an input and
                  calculate, or open a saved report. Snapshots stay unchanged.
                </p>
                {report && report.report_id !== baseline.report_id ? (
                  <div className="table-scroll">
                    <table>
                      <caption>
                        Same idealized model; each column uses its own inputs.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col">Quantity</th>
                          <th scope="col">
                            Pinned baseline
                            <small>
                              {baseline.report_id.slice(0, 8)} ·{" "}
                              {formatDate(baseline.created_at)}
                            </small>
                          </th>
                          <th scope="col">
                            Current snapshot
                            <small>
                              {report.report_id.slice(0, 8)} ·{" "}
                              {formatDate(report.created_at)}
                            </small>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          "Tensile yield strength",
                          "Shank diameter",
                          "Applied load",
                          "Shear planes",
                          "Load factor",
                          "Nominal capacity",
                          "Factored demand",
                          "Model margin",
                        ].map((label, i) => (
                          <tr key={label}>
                            <th scope="row">{label}</th>
                            <td>{comparisonRows(baseline)[i]}</td>
                            <td>{comparisonRows(report)[i]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="comparison-empty">
                    Now change an input and calculate a second scenario.
                  </p>
                )}
              </section>
            )}

            <section
              className="card history-card no-print"
              id="history"
              aria-labelledby="history-title"
            >
              <div className="section-heading">
                <div>
                  <p className="eyebrow">YOUR WORK</p>
                  <h2 id="history-title">Saved report history</h2>
                </div>
                <span className="history-count">
                  {history.reports.length} / {MAX_HISTORY_REPORTS}
                </span>
              </div>
              <p className="card-intro">
                Stored in this browser only. Open an original snapshot to
                inspect or compare; it is never recalculated. Export reports to
                keep a copy outside this browser.
              </p>
              {historyNotice && (
                <p
                  className={`history-message ${historyWarning ? "warning" : "info"}`}
                  role="status"
                >
                  {historyNotice}
                </p>
              )}
              {(history.state === "corrupt" ||
                history.state === "unsupported") && (
                <button
                  className="button secondary"
                  onClick={() => {
                    setHistoryNotice(downloadRawHistory());
                    setHistoryWarning(true);
                  }}
                >
                  Download original history data
                </button>
              )}
              {history.reports.length === 0 ? (
                <p className="history-empty">
                  Your first calculation will appear here.
                </p>
              ) : (
                <ol className="history-list">
                  {history.reports.map((saved) => (
                    <li key={saved.report_id}>
                      <button
                        className={`history-item ${report?.report_id === saved.report_id ? "selected" : ""}`}
                        aria-pressed={report?.report_id === saved.report_id}
                        onClick={() => selectSavedReport(saved)}
                      >
                        <span>
                          <strong>
                            Ø {formatResult(saved.inputs.shank_diameter.value)}{" "}
                            mm{" "}
                            <span className="history-load">
                              /{" "}
                              {formatResult(
                                saved.inputs.applied_shear_load.value / 1000,
                              )}{" "}
                              kN load
                            </span>
                          </strong>
                          <small>
                            {formatDate(saved.created_at)} ·{" "}
                            {saved.report_id.slice(0, 8)}
                          </small>
                        </span>
                        <span className="history-summary">
                          <strong>
                            {formatResult(
                              saved.result.total_nominal_yield_capacity_N /
                                1000,
                            )}{" "}
                            kN
                          </strong>
                          <small>
                            nominal capacity · {saved.inputs.shear_planes.value}{" "}
                            plane(s)
                          </small>
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            <section className="card method-card no-print" id="method">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">KNOW THE MODEL</p>
                  <h2>Assumptions & limitations</h2>
                </div>
                <a href={MODEL_SOURCE} target="_blank" rel="noreferrer">
                  MIT formula source ↗
                </a>
              </div>
              <div className="method-grid">
                <div>
                  <h3>What this estimates</h3>
                  <p>
                    Static, concentric, pure shear of a ductile, isotropic
                    material. Full circular, unthreaded shank area at each
                    plane, equal load sharing, and a user-selected load factor.
                  </p>
                  <code>τᵧ = Fᵧ / √3 · C = τᵧ × πd²/4 × n</code>
                </div>
                <div>
                  <h3>What still needs checking</h3>
                  <p>
                    Ultimate failure, threads, bearing, tear-out, slip, preload,
                    fatigue, eccentricity, bending, and combined loading. Verify
                    material properties and assess the actual connection with a
                    qualified engineer.
                  </p>
                  <p className="muted">
                    David Roylance, MIT, <em>Yield and Plastic Flow</em>,
                    printed page 5. This derivation is not a fastener design
                    standard.
                  </p>
                </div>
              </div>
            </section>
          </div>
          <div id="axial-panel" hidden={module !== "axial"}>
            <AxialCalculator />
          </div>
          <section className="module-catalogue no-print" id="module-catalogue">
            <div className="section-heading">
              <div>
                <p className="eyebrow">A GROWING TOOLKIT</p>
                <h2>One workspace. Clear scope.</h2>
              </div>
            </div>
            <div className="module-grid">
              <button
                className="module-card"
                onClick={() => {
                  setModule("bolt");
                  document.getElementById("workspace")?.scrollIntoView();
                }}
              >
                <span className="module-status">Available</span>
                <h3>Bolt shear</h3>
                <p>Idealized smooth-shank shear yield, with saved scenarios.</p>
                <span>Open calculator →</span>
              </button>
              <button
                className="module-card"
                onClick={() => {
                  setModule("units");
                  document.getElementById("workspace")?.scrollIntoView();
                }}
              >
                <span className="module-status">Available</span>
                <h3>Unit converter</h3>
                <p>
                  20 quantities, metric and imperial units, temperature offsets
                  and equivalent values.
                </p>
                <span>Open converter →</span>
              </button>
              <button
                className="module-card"
                onClick={() => {
                  setModule("axial");
                  document.getElementById("workspace")?.scrollIntoView();
                }}
              >
                <span className="module-status">Available</span>
                <h3>Axial yield</h3>
                <p>
                  Nominal tensile yield of a smooth round member. Separate from
                  a connection check.
                </p>
                <span>Open axial model →</span>
              </button>
            </div>
          </section>
          <p className="planned roadmap-note no-print">
            Connection design checks remain unavailable. Threads, bearing,
            combined loading, and joint behavior require separately sourced and
            verified models.
          </p>
          <footer className="app-footer no-print">
            <span>EngCalc / Understand every number.</span>
            <span>Local history is not a backup. Export what matters.</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
