import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Globe } from "./components/Globe";
import { YearAnalysisChart } from "./components/YearAnalysisChart";
import {
  type Model,
  type SimResult,
  type YearPoint,
  computeBaselineShortfall,
  computeShockResult,
  runAnalysisAcrossYears,
} from "./lib/analysis";
import { getBondSpreadVsUS, getBondYield, getPolicyRate, getStockChange } from "./lib/marketData";
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

  const [analysisPoints, setAnalysisPoints] = useState<YearPoint[] | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);

  const network = useMemo<ExposureNetwork | null>(
    () => (yearData ? buildExposureNetwork(yearData) : null),
    [yearData],
  );

  const baselineShortfall = useMemo(() => (network ? computeBaselineShortfall(network) : null), [network]);

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
    if (!network || !baselineShortfall) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPanelOpen(true);
    setShockedId(id);
    setIteration(0);
    setAnalysisPoints(null);

    const res = computeShockResult(network, id, mag, mdl, baselineShortfall);
    setResult(res);

    if (res.kind === "debtrank") {
      timerRef.current = window.setInterval(() => {
        setIteration((prev) => {
          if (prev >= res.history.length - 1) {
            if (timerRef.current) window.clearInterval(timerRef.current);
            return prev;
          }
          return prev + 1;
        });
      }, 500);
    }
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
    setAnalysisPoints(null);
  }

  async function viewAcrossYears() {
    if (!shockedId) return;
    setAnalysisLoading(true);
    setAnalysisProgress(YEARS[0]);
    const points = await runAnalysisAcrossYears(shockedId, magnitude, model, setAnalysisProgress);
    setAnalysisPoints(points);
    setAnalysisLoading(false);
    setAnalysisProgress(null);
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
                <div className="market-check-rows">
                  <span className="market-check-value">
                    10Y yield{" "}
                    {getBondYield(shockedId, year) !== null ? (
                      <>
                        <strong>{getBondYield(shockedId, year)?.toFixed(2)}%</strong>
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
                      </>
                    ) : (
                      <span className="muted">no data</span>
                    )}
                  </span>
                  <span className="market-check-value">
                    Policy rate{" "}
                    {getPolicyRate(shockedId, year) !== null ? (
                      <strong>{getPolicyRate(shockedId, year)?.toFixed(2)}%</strong>
                    ) : (
                      <span className="muted">no data</span>
                    )}
                  </span>
                  <span className="market-check-value">
                    Stock index (YoY){" "}
                    {getStockChange(shockedId, year) !== null ? (
                      <strong>
                        {(getStockChange(shockedId, year)! >= 0 ? "+" : "")}
                        {getStockChange(shockedId, year)?.toFixed(1)}%
                      </strong>
                    ) : (
                      <span className="muted">no data</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {analysisPoints ? (
              <>
                <YearAnalysisChart points={analysisPoints} />
                <button className="analysis-toggle" onClick={() => setAnalysisPoints(null)}>
                  Hide chart
                </button>
              </>
            ) : (
              <button className="analysis-toggle" onClick={viewAcrossYears} disabled={analysisLoading}>
                {analysisLoading ? `Loading ${analysisProgress}…` : "View across years →"}
              </button>
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
