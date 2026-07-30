import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Globe } from "./components/Globe";
import { runDebtRank } from "./lib/debtrank";
import { clearingVector } from "./lib/eisenbergNoe";
import { getBondSpreadVsUS, getBondYield } from "./lib/bondYields";
import {
  DEFAULT_YEAR,
  YEARS,
  buildExposureNetwork,
  countries,
  loadYearData,
  type YearSnapshot,
} from "./lib/network";
import type { ExposureNetwork } from "./lib/debtrank";
import "./App.css";

type Model = "debtrank" | "eisenberg-noe";

type SimResult =
  | { kind: "debtrank"; nodeIds: string[]; history: number[][]; debtrank: number }
  | { kind: "eisenberg-noe"; nodeIds: string[]; distress: number[]; iterations: number; aggregate: number };

function App() {
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [displayYear, setDisplayYear] = useState(DEFAULT_YEAR);
  const [yearData, setYearData] = useState<YearSnapshot | null>(null);
  const [yearLoading, setYearLoading] = useState(true);
  const yearDebounceRef = useRef<number | null>(null);

  const [shockedId, setShockedId] = useState<string | null>(null);
  const [model, setModel] = useState<Model>("debtrank");
  const [magnitude, setMagnitude] = useState(1.0);
  const [result, setResult] = useState<SimResult | null>(null);
  const [iteration, setIteration] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const network = useMemo<ExposureNetwork | null>(
    () => (yearData ? buildExposureNetwork(yearData) : null),
    [yearData],
  );

  // Real cross-border bank liabilities routinely dwarf a country's FX
  // reserves, so an unshocked Eisenberg-Noe clearing vector already shows
  // many countries "short" at baseline -- that's a data-scale mismatch
  // (reserves aren't meant to cover gross private-sector bank claims), not
  // contagion. We net the shocked result against this baseline so the UI
  // shows only the shock's marginal effect, mirroring how DebtRank nets
  // final distress against its initial state.
  const baselineShortfall = useMemo(() => {
    if (!network) return null;
    const n = network.nodeIds.length;
    const liabilities = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => network.exposure[b][a]),
    );
    const cv = clearingVector(network.nodeIds, liabilities, network.equity);
    return cv.nominalLiabilities.map((pBar, i) => (pBar > 0 ? Math.max(0, (pBar - cv.payments[i]) / pBar) : 0));
  }, [network]);

  const sortedCountries = useMemo(
    () => [...countries].sort((a, b) => a.name.localeCompare(b.name)),
    [],
  );

  useEffect(() => {
    let cancelled = false;
    setYearLoading(true);
    loadYearData(year).then((data) => {
      if (cancelled) return;
      setYearData(data);
      setYearLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [year]);

  function onYearChange(value: number) {
    setDisplayYear(value);
    if (yearDebounceRef.current) window.clearTimeout(yearDebounceRef.current);
    yearDebounceRef.current = window.setTimeout(() => setYear(value), 250);
  }

  function runShock(id: string, mag: number, mdl: Model) {
    if (!network) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPanelOpen(true);
    setShockedId(id);
    setIteration(0);

    if (mdl === "debtrank") {
      const res = runDebtRank(network, { [id]: mag });
      setResult({ kind: "debtrank", nodeIds: res.nodeIds, history: res.history, debtrank: res.debtrank });
      timerRef.current = window.setInterval(() => {
        setIteration((prev) => {
          if (prev >= res.history.length - 1) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 500);
      return;
    }

    // Eisenberg-Noe: liabilities[a][b] = a's debt to b = exposure[b][a]
    // (exposure[i][j] is i's claim on j, so the debtor/creditor roles flip).
    const n = network.nodeIds.length;
    const liabilities = Array.from({ length: n }, (_, a) =>
      Array.from({ length: n }, (_, b) => network.exposure[b][a]),
    );
    const idx = network.nodeIds.indexOf(id);
    const externalAssets = network.equity.slice();
    if (idx >= 0) externalAssets[idx] *= 1 - mag;

    const cv = clearingVector(network.nodeIds, liabilities, externalAssets);
    const distress = cv.nominalLiabilities.map((pBar, i) => {
      if (pBar <= 0) return 0;
      const shockedShortfall = Math.max(0, (pBar - cv.payments[i]) / pBar);
      const baseline = baselineShortfall?.[i] ?? 0;
      return Math.max(0, shockedShortfall - baseline);
    });
    const totalEquity = network.equity.reduce((a, b) => a + b, 0);
    const aggregate = distress.reduce((sum, d, i) => sum + d * (network.equity[i] / totalEquity), 0);

    setResult({ kind: "eisenberg-noe", nodeIds: cv.nodeIds, distress, iterations: cv.iterations, aggregate });
  }

  function triggerShock(id: string) {
    runShock(id, magnitude, model);
  }

  function onMagnitudeChange(value: number) {
    setMagnitude(value);
    if (shockedId) runShock(shockedId, value, model);
  }

  function onModelChange(value: Model) {
    setModel(value);
    if (shockedId) runShock(shockedId, magnitude, value);
  }

  function reset() {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setShockedId(null);
    setResult(null);
    setIteration(0);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  // Scrubbing to a new year rebuilds `network`; re-run the active shock
  // under the new year's data so the globe/ranked list stay in sync.
  useEffect(() => {
    if (network && shockedId) runShock(shockedId, magnitude, model);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [network]);

  const distress = !result
    ? new Array(countries.length).fill(0)
    : result.kind === "debtrank"
      ? result.history[iteration]
      : result.distress;

  const ranked = useMemo(() => {
    if (!result) return [];
    return result.nodeIds
      .map((id, i) => ({ id, name: countries.find((c) => c.id === id)?.name ?? id, level: distress[i] }))
      .filter((r) => r.level > 1e-6)
      .sort((a, b) => b.level - a.level);
  }, [result, distress]);

  return (
    <div className="app">
      <div className="globe-pane">
        {yearData && (
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <Globe yearData={yearData} distress={distress} shockedId={shockedId} onSelect={triggerShock} />
          </Canvas>
        )}
        {yearLoading && <div className="year-loading">Loading {displayYear}&hellip;</div>}
      </div>

      <nav className="navbar">
        <span className="navbar-title">debtrank-globe</span>
        <button
          className="menu-button"
          aria-label={panelOpen ? "Close controls" : "Open controls"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
      </nav>

      <aside className={`panel${panelOpen ? " open" : ""}`}>
        <header className="panel-head">
          <p className="subtitle">
            Distress propagation over a real cross-border exposure network
            sourced from the World Bank and BIS. Click a country on the
            globe, or pick one below, to simulate a default.
          </p>
          <dl className="stats">
            <div>
              <dt>Countries</dt>
              <dd>{countries.length}</dd>
            </div>
            <div>
              <dt>Exposure edges</dt>
              <dd>{(yearData?.edges.length ?? 0).toLocaleString()}</dd>
            </div>
          </dl>
        </header>

        <label className="year-scrubber">
          <span>
            Network year <strong>{displayYear}</strong>
          </span>
          <input
            type="range"
            min={YEARS[0]}
            max={YEARS[YEARS.length - 1]}
            step={1}
            value={displayYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
          />
        </label>

        <div className="model-toggle" role="group" aria-label="Contagion model">
          <button
            className={model === "debtrank" ? "active" : undefined}
            onClick={() => onModelChange("debtrank")}
          >
            DebtRank
          </button>
          <button
            className={model === "eisenberg-noe" ? "active" : undefined}
            onClick={() => onModelChange("eisenberg-noe")}
          >
            Eisenberg-Noe
          </button>
        </div>

        <div className="controls">
          <select
            value={shockedId ?? ""}
            onChange={(e) => e.target.value && triggerShock(e.target.value)}
          >
            <option value="">Select a country to shock&hellip;</option>
            {sortedCountries.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button onClick={reset} disabled={!result}>
            Reset
          </button>
        </div>

        <label className="magnitude">
          <span>
            Shock magnitude <strong>{Math.round(magnitude * 100)}%</strong>
          </span>
          <input
            type="range"
            min={5}
            max={100}
            step={5}
            value={magnitude * 100}
            onChange={(e) => onMagnitudeChange(Number(e.target.value) / 100)}
          />
        </label>

        {result ? (
          <div className="results">
            <div className="results-head">
              {result.kind === "debtrank" ? (
                <>
                  <span>
                    Iteration {iteration} / {result.history.length - 1}
                  </span>
                  <span className="impact">
                    impact <strong>{result.debtrank.toFixed(4)}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span>Converged in {result.iterations} iterations</span>
                  <span className="impact">
                    shortfall <strong>{result.aggregate.toFixed(4)}</strong>
                  </span>
                </>
              )}
            </div>

            {shockedId && (
              <div className="market-check">
                <span className="market-check-label">Market check ({year})</span>
                {getBondYield(shockedId, year) !== null ? (
                  <span className="market-check-value">
                    10Y yield <strong>{getBondYield(shockedId, year)?.toFixed(2)}%</strong>
                    {shockedId !== "USA" && getBondSpreadVsUS(shockedId, year) !== null && (
                      <>
                        {" "}
                        &middot; spread vs US{" "}
                        <strong>
                          {(getBondSpreadVsUS(shockedId, year)! >= 0 ? "+" : "")}
                          {getBondSpreadVsUS(shockedId, year)?.toFixed(2)}pp
                        </strong>
                      </>
                    )}
                  </span>
                ) : (
                  <span className="market-check-value muted">no FRED bond-yield data for this country</span>
                )}
              </div>
            )}

            <ol>
              {ranked.map((r) => (
                <li key={r.id} className={r.id === shockedId ? "shocked" : undefined}>
                  <span className="name">{r.name}</span>
                  <span className="bar-track">
                    <span className="bar-fill" style={{ transform: `scaleX(${r.level})` }} />
                  </span>
                  <span className="level">{(r.level * 100).toFixed(1)}%</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <div className="legend">
            <span className="legend-title">Distress scale</span>
            <div className="legend-gradient" />
            <div className="legend-labels">
              <span>stable</span>
              <span>default</span>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;
