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
  explainExposure,
  loadYearData,
  type YearSnapshot,
} from "./lib/network";
import { formatUsd } from "./lib/format";
import type { EquitySource, ExposureNetwork } from "./lib/debtrank";
import { isFinancialCenter } from "./lib/financialCenters";
import { clearScenarioFromUrl, parseScenarioFromUrl, writeScenarioToUrl } from "./lib/scenarioUrl";
import { PRESETS } from "./lib/presets";

// Parsed once at module load (there's exactly one URL to read at startup);
// seeds the initial state below so a shared link reproduces its scenario.
const initialScenario = parseScenarioFromUrl();

// Only "reserves" is a real observed figure -- the others are modeled
// proxies (see equityFor() in lib/network.ts for the full rationale).
const EQUITY_SOURCE_LABEL: Record<EquitySource, string> = {
  reserves: "Equity source: FX reserves (reported)",
  gdp: "Equity source: estimated from GDP (no reserves data)",
  capital_ratio: "Equity source: estimated from bank capital ratio (no reserves data)",
  floor: "Equity source: floor estimate (no reserves, GDP, or capital-ratio data)",
};

const glass =
  "border border-sky-200/10 bg-[linear-gradient(145deg,rgba(10,23,39,0.82),rgba(3,9,18,0.72))] shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-2xl";
const focus =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400";
const range =
  "h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-400/15 outline-none [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-sky-400 [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(56,189,248,0.16)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(56,189,248,0.16)]";
const secondaryButton = `${focus} rounded-xl border border-sky-200/10 bg-slate-950/25 text-slate-300 transition hover:border-sky-400/50 hover:bg-sky-400/5 hover:text-slate-50 disabled:cursor-default disabled:opacity-35 disabled:hover:border-sky-200/10 disabled:hover:bg-slate-950/25 disabled:hover:text-slate-300`;

function App() {
  const [year, setYear] = useState(initialScenario?.year ?? DEFAULT_YEAR);
  const [displayYear, setDisplayYear] = useState(initialScenario?.year ?? DEFAULT_YEAR);
  const [yearData, setYearData] = useState<YearSnapshot | null>(null);
  const [yearLoading, setYearLoading] = useState(true);
  const yearDebounceRef = useRef<number | null>(null);

  const [shockedId, setShockedId] = useState<string | null>(initialScenario?.shockId ?? null);
  const [model, setModel] = useState<Model>(initialScenario?.model ?? "debtrank");
  const [magnitude, setMagnitude] = useState(initialScenario?.magnitude ?? 1.0);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [iteration, setIteration] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const [analysisPoints, setAnalysisPoints] = useState<YearPoint[] | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  const [hideFinancialCenters, setHideFinancialCenters] = useState(false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

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
    setExpandedRowId(null);

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

  // Shared by the historical presets picker (and reproduces the same
  // "seed state, let data load, effect fires the shock" flow the URL
  // restore uses on mount): if the target year is already loaded, shock
  // immediately; otherwise set state and let the existing
  // `runShock` on network-change effect fire once that year's data arrives.
  function applyScenario(s: { year: number; countryId: string; magnitude: number; model: Model }) {
    setModel(s.model);
    setMagnitude(s.magnitude);
    setDisplayYear(s.year);
    setShockedId(s.countryId);
    if (s.year === year) {
      runShock(s.countryId, s.magnitude, s.model);
    } else {
      setYear(s.year);
    }
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
    clearScenarioFromUrl();
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can be unavailable (insecure context, denied
      // permission, ...) -- the URL is still visible/copyable manually.
    }
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

  // Mirror the live scenario into the URL so it's always a copyable link;
  // cleared (not written) once there's no active shock to describe.
  useEffect(() => {
    if (shockedId) writeScenarioToUrl({ year, shockId, magnitude, model });
  }, [year, shockedId, magnitude, model]);

  const distress = !result
    ? new Array(countries.length).fill(0)
    : result.kind === "debtrank"
      ? result.history[iteration]
      : result.distress;

  const rankedAll = useMemo(() => {
    if (!result || !network) return [];
    return result.nodeIds
      .map((id, i) => ({
        id,
        name: countries.find((c) => c.id === id)?.name ?? id,
        level: distress[i],
        source: network.equitySource?.[i],
      }))
      .filter((r) => r.level > 1e-6)
      .sort((a, b) => b.level - a.level);
  }, [result, distress, network]);

  const ranked = useMemo(
    () => (hideFinancialCenters ? rankedAll.filter((r) => !isFinancialCenter(r.id)) : rankedAll),
    [rankedAll, hideFinancialCenters],
  );

  const hiddenFinancialCenterCount = rankedAll.length - ranked.length;

  return (
    <div className="relative h-dvh w-screen overflow-hidden bg-[#02050c] font-sans text-slate-400 antialiased selection:bg-sky-400/20 selection:text-slate-50">
      <div className="absolute inset-0">
        {yearData && (
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <Globe yearData={yearData} distress={distress} shockedId={shockedId} onSelect={triggerShock} />
          </Canvas>
        )}
        {yearLoading && (
          <div className={`${glass} absolute bottom-5 left-5 z-10 rounded-xl px-3 py-1.5 font-mono text-xs text-slate-300`}>
            Loading {displayYear}&hellip;
          </div>
        )}
      </div>

      <nav
        className={`${glass} fixed left-3 right-3 top-3 z-20 flex min-h-14 items-center justify-between rounded-2xl px-4 py-3 sm:left-4 sm:right-4 sm:top-4`}
      >
        <span className="font-mono text-[14.5px] font-semibold tracking-[-0.02em] text-slate-100">
          debt<span className="text-sky-400">rank</span>
          <span className="text-slate-500">-globe</span>
        </span>
        <button
          className={`${focus} group flex size-9 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-sky-200/10 bg-slate-950/25 transition hover:border-sky-400/50 hover:bg-sky-400/5 ${
            panelOpen ? "sm:hidden" : ""
          }`}
          aria-label={panelOpen ? "Close controls" : "Open controls"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="block h-px w-4 rounded-full bg-slate-100 transition duration-200 group-aria-expanded:translate-y-[5px] group-aria-expanded:rotate-45" />
          <span className="block h-px w-4 rounded-full bg-slate-100 transition duration-200 group-aria-expanded:opacity-0" />
          <span className="block h-px w-4 rounded-full bg-slate-100 transition duration-200 group-aria-expanded:-translate-y-[5px] group-aria-expanded:-rotate-45" />
        </button>
      </nav>

      <aside
        className={`fixed bottom-0 right-0 top-20 z-30 flex min-h-0 w-full flex-col gap-4 overflow-hidden border-l border-sky-200/10 bg-[linear-gradient(160deg,rgba(10,23,39,0.985),rgba(2,7,15,0.98))] px-4 pb-5 pt-4 shadow-[-24px_0_100px_rgba(0,0,0,0.28)] backdrop-blur-2xl transition-transform duration-300 ease-out motion-reduce:transition-none sm:top-0 sm:w-[380px] sm:gap-5 sm:px-6 sm:pb-6 sm:pt-5 ${
          panelOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="hidden shrink-0 items-center justify-between sm:flex">
          <span className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Controls
          </span>
          <button
            className={`${focus} flex size-9 cursor-pointer items-center justify-center rounded-xl border border-sky-200/10 bg-slate-950/25 text-slate-400 transition hover:border-sky-400/50 hover:bg-sky-400/5 hover:text-slate-100`}
            aria-label="Close controls"
            onClick={() => setPanelOpen(false)}
          >
            <span className="relative block size-4">
              <span className="absolute left-0 top-1/2 block h-px w-4 -translate-y-1/2 rotate-45 rounded-full bg-current" />
              <span className="absolute left-0 top-1/2 block h-px w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
            </span>
          </button>
        </div>

        <div data-testid="sidebar-controls" className="flex shrink-0 flex-col gap-4 sm:gap-5">
        <header className="flex shrink-0 flex-col">
          <span className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-[0.16em] text-sky-400">
            Systemic risk simulation
          </span>
          <p className="mb-4 text-[13px] leading-5 text-slate-400 sm:mb-5 sm:leading-6">
            Distress propagation over a real cross-border exposure network
            sourced from the World Bank and BIS. Click a country on the
            globe, or pick one below, to simulate a default.
          </p>
          <dl className="flex gap-8 border-t border-sky-200/10 pt-4">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Countries</dt>
              <dd className="mt-1 font-mono text-lg tabular-nums text-slate-100">{countries.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">Exposure edges</dt>
              <dd className="mt-1 font-mono text-lg tabular-nums text-slate-100">
                {(yearData?.edges.length ?? 0).toLocaleString()}
              </dd>
            </div>
          </dl>
        </header>

        <label className="flex shrink-0 flex-col gap-2.5 text-xs text-slate-400">
          <span className="flex items-center justify-between">
            Network year <strong className="font-mono text-sm font-medium text-slate-100">{displayYear}</strong>
          </span>
          <input
            className={range}
            type="range"
            min={YEARS[0]}
            max={YEARS[YEARS.length - 1]}
            step={1}
            value={displayYear}
            onChange={(e) => onYearChange(Number(e.target.value))}
          />
        </label>

        <div className="flex shrink-0 overflow-hidden rounded-xl border border-sky-200/10 bg-slate-950/25 p-1" role="group" aria-label="Contagion model">
          <button
            className={`${focus} flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition ${
              model === "debtrank"
                ? "bg-sky-400/12 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]"
                : "text-slate-500 hover:text-slate-200"
            }`}
            onClick={() => onModelChange("debtrank")}
          >
            DebtRank
          </button>
          <button
            className={`${focus} flex-1 cursor-pointer rounded-lg px-3 py-2 text-xs font-medium transition ${
              model === "eisenberg-noe"
                ? "bg-sky-400/12 text-sky-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.2)]"
                : "text-slate-500 hover:text-slate-200"
            }`}
            onClick={() => onModelChange("eisenberg-noe")}
          >
            Eisenberg-Noe
          </button>
        </div>

        <div className="flex shrink-0 flex-col gap-1.5">
          <select
            className={`${focus} min-w-0 appearance-none rounded-xl border border-sky-200/10 bg-slate-950/45 px-3 py-2.5 text-[13px] text-slate-100 transition hover:border-sky-400/30`}
            value=""
            onChange={(e) => {
              const preset = PRESETS.find((p) => p.id === e.target.value);
              if (preset) applyScenario(preset);
            }}
          >
            <option value="">Or jump to a historical scenario&hellip;</option>
            {PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="text-[10.5px] leading-4 text-slate-500">
            Illustrative shock magnitudes -- not empirically calibrated to actual losses.
          </p>
        </div>

        <select
          className={`${focus} shrink-0 min-w-0 appearance-none rounded-xl border border-sky-200/10 bg-slate-950/45 px-3 py-2.5 text-[13px] text-slate-100 transition hover:border-sky-400/30`}
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

        <div className="flex shrink-0 gap-2">
          <button
            className={`${secondaryButton} flex-1 px-4 py-2.5 text-[13px]`}
            onClick={copyLink}
            disabled={!shockedId}
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <button
            className={`${secondaryButton} flex-1 px-4 py-2.5 text-[13px]`}
            onClick={reset}
            disabled={!result}
          >
            Reset
          </button>
        </div>

        <label className="flex shrink-0 flex-col gap-2.5 text-xs text-slate-400">
          <span className="flex items-center justify-between">
            Shock magnitude{" "}
            <strong className="font-mono text-sm font-medium text-slate-100">
              {Math.round(magnitude * 100)}%
            </strong>
          </span>
          <input
            className={range}
            type="range"
            min={5}
            max={100}
            step={5}
            value={magnitude * 100}
            onChange={(e) => onMagnitudeChange(Number(e.target.value) / 100)}
          />
        </label>

        {result ? (
          <div className="flex shrink-0 flex-col gap-3">
            <div
              role="status"
              aria-live="polite"
              className="flex items-center justify-between rounded-lg border border-sky-200/8 bg-sky-400/[0.035] px-2.5 py-2 font-mono text-xs text-slate-400"
            >
              {result.kind === "debtrank" ? (
                <>
                  <span>
                    Iteration {iteration} / {result.history.length - 1}
                  </span>
                  <span>
                    impact <strong className="font-semibold text-amber-400">{result.debtrank.toFixed(4)}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span>Converged in {result.iterations} iterations</span>
                  <span>
                    shortfall <strong className="font-semibold text-amber-400">{result.aggregate.toFixed(4)}</strong>
                  </span>
                </>
              )}
            </div>

            {shockedId && (
              <div className="flex flex-col gap-1 rounded-xl border border-sky-200/10 bg-slate-950/25 px-3 py-2.5 text-xs">
                <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
                  Market check ({year})
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="font-mono text-slate-200 [&_strong]:font-semibold [&_strong]:text-sky-400">
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
                      <span className="font-sans italic text-slate-500">no data</span>
                    )}
                  </span>
                  <span className="font-mono text-slate-200 [&_strong]:font-semibold [&_strong]:text-sky-400">
                    Policy rate{" "}
                    {getPolicyRate(shockedId, year) !== null ? (
                      <strong>{getPolicyRate(shockedId, year)?.toFixed(2)}%</strong>
                    ) : (
                      <span className="font-sans italic text-slate-500">no data</span>
                    )}
                  </span>
                  <span className="font-mono text-slate-200 [&_strong]:font-semibold [&_strong]:text-sky-400">
                    Stock index (YoY){" "}
                    {getStockChange(shockedId, year) !== null ? (
                      <strong>
                        {(getStockChange(shockedId, year)! >= 0 ? "+" : "")}
                        {getStockChange(shockedId, year)?.toFixed(1)}%
                      </strong>
                    ) : (
                      <span className="font-sans italic text-slate-500">no data</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {analysisPoints ? (
              <>
                <YearAnalysisChart points={analysisPoints} />
                <button
                  className={`${secondaryButton} self-start px-3 py-1.5 text-xs text-sky-400`}
                  onClick={() => setAnalysisPoints(null)}
                >
                  Hide chart
                </button>
              </>
            ) : (
              <button
                className={`${secondaryButton} self-start px-3 py-1.5 text-xs text-sky-400`}
                onClick={viewAcrossYears}
                disabled={analysisLoading}
              >
                {analysisLoading ? `Loading ${analysisProgress}…` : "View across years →"}
              </button>
            )}

          </div>
        ) : (
          <div className="flex flex-col gap-2 pt-1">
            <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">
              Distress scale
            </span>
            <div className="h-1.5 rounded-full bg-linear-to-r from-slate-700 via-amber-400 to-red-500" />
            <div className="flex justify-between text-[11px] text-slate-500">
              <span>stable</span>
              <span>default</span>
            </div>
          </div>
        )}
        </div>

        {result && rankedAll.length > 0 && (
          <div className="flex min-h-0 flex-1 flex-col border-t border-sky-200/10">
            <div
              data-testid="ranking-header"
              className="flex shrink-0 items-center justify-between bg-[#06101d] py-3 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500"
            >
              <span>Propagation ranking</span>
              <span>{ranked.length} affected</span>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2 pb-2.5 text-[11px] text-slate-400">
              <input
                type="checkbox"
                className="size-3.5 cursor-pointer rounded border-sky-200/20 bg-slate-950/45 text-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-400"
                checked={hideFinancialCenters}
                onChange={(e) => setHideFinancialCenters(e.target.checked)}
              />
              Hide financial centers
              {hideFinancialCenters && hiddenFinancialCenterCount > 0 && (
                <span className="font-mono text-slate-600">({hiddenFinancialCenterCount} hidden)</span>
              )}
            </label>
            {!hideFinancialCenters && rankedAll.some((r) => isFinancialCenter(r.id)) && (
              <p className="mb-2.5 shrink-0 text-[10.5px] leading-4 text-slate-500">
                Marked entries are cross-border financial centres (e.g. Isle
                of Man, Hong Kong SAR) whose gross banking exposure runs to
                multiples of local GDP -- they tend to rank high for almost
                any shock. See{" "}
                <a
                  className="underline decoration-slate-600 underline-offset-2 hover:text-sky-400"
                  href="https://www.bis.org/publ/qtrpdf/r_qt2206b.htm"
                  target="_blank"
                  rel="noreferrer"
                >
                  BIS, June 2022
                </a>
                .
              </p>
            )}
            {rankedAll.some((r) => r.source && r.source !== "reserves") && (
              <p className="mb-2.5 shrink-0 text-[10.5px] leading-4 text-slate-500">
                Hatched bars use estimated, not directly reported, loss-buffer
                data -- hover a country for its exact source.
              </p>
            )}
            {ranked.length === 0 ? (
              <p className="pb-2 text-xs italic text-slate-500">
                All affected countries are financial centers, hidden above.
              </p>
            ) : (
            <div
              data-testid="ranked-results"
              className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-color:rgba(56,189,248,0.25)_transparent] [scrollbar-width:thin]"
            >
            <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
              {ranked.map((r) => {
                const canExpand = shockedId !== null && r.id !== shockedId;
                return (
                <li
                  key={r.id}
                  className={`group grid grid-cols-[minmax(0,1fr)_72px_46px] items-center gap-2.5 rounded-lg px-1.5 py-1 text-xs transition-colors hover:bg-sky-400/[0.045] ${
                    canExpand ? "cursor-pointer" : ""
                  }`}
                  onClick={() => canExpand && setExpandedRowId((id) => (id === r.id ? null : r.id))}
                >
                  <span
                    className={`truncate ${
                      r.id === shockedId ? "font-semibold text-amber-400" : "text-slate-200"
                    }`}
                    title={
                      [
                        isFinancialCenter(r.id) ? "Cross-border financial centre" : null,
                        r.source ? EQUITY_SOURCE_LABEL[r.source] : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || undefined
                    }
                  >
                    {r.name}
                    {isFinancialCenter(r.id) && <span className="ml-1 text-slate-600">*</span>}
                  </span>
                  <span className="relative h-1.5 overflow-hidden rounded-full bg-slate-400/10">
                    <span
                      className="absolute inset-0 origin-left rounded-full transition-transform duration-400"
                      style={{
                        transform: `scaleX(${r.level})`,
                        backgroundImage:
                          r.source && r.source !== "reserves"
                            ? "linear-gradient(to right, #fbbf24, #ef4444), repeating-linear-gradient(135deg, rgba(2,5,12,0.4) 0px, rgba(2,5,12,0.4) 2px, transparent 2px, transparent 5px)"
                            : "linear-gradient(to right, #fbbf24, #ef4444)",
                      }}
                    />
                  </span>
                  <span className="text-right font-mono text-slate-400 tabular-nums">
                    {(r.level * 100).toFixed(1)}%
                  </span>
                  {expandedRowId === r.id && network && shockedId && (() => {
                    const shockedName = countries.find((c) => c.id === shockedId)?.name ?? shockedId;
                    const explanation = explainExposure(network, r.id, shockedId);
                    return (
                      <div className="col-span-3 -mt-1 flex flex-col gap-0.5 rounded-lg bg-slate-950/40 px-2.5 py-2 font-mono text-[11px] text-slate-400">
                        {explanation.claimOnShocked > 0 || explanation.owedToShocked > 0 ? (
                          <>
                            {explanation.claimOnShocked > 0 && (
                              <span>
                                Claim on {shockedName}:{" "}
                                <strong className="text-slate-200">{formatUsd(explanation.claimOnShocked)}</strong>
                              </span>
                            )}
                            {explanation.owedToShocked > 0 && (
                              <span>
                                Owes {shockedName}:{" "}
                                <strong className="text-slate-200">{formatUsd(explanation.owedToShocked)}</strong>
                              </span>
                            )}
                          </>
                        ) : explanation.viaCountry ? (
                          <span className="font-sans italic">
                            No direct exposure -- likely indirect, via{" "}
                            {countries.find((c) => c.id === explanation.viaCountry)?.name ?? explanation.viaCountry}
                          </span>
                        ) : (
                          <span className="font-sans italic">
                            No direct or strongly-inferred indirect link in this year's data.
                          </span>
                        )}
                      </div>
                    );
                  })()}
                </li>
                );
              })}
            </ol>
            </div>
            )}
          </div>
        )}
      </aside>
    </div>
  );
}

export default App;
