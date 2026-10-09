import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Globe } from "./components/Globe";
import { PairSparkline } from "./components/PairSparkline";
import { YearAnalysisChart } from "./components/YearAnalysisChart";
import { Button, Drawer, IconButton, Panel, SegmentedToggle, TabPanel, Tabs, checkbox, focus, hairline, note, sectionLabel } from "./ui";
import {
  type Model,
  type ShockSpec,
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
import { buildCountryProfile, type Counterparty, type CountryProfile } from "./lib/countryProfile";
import { formatUsd } from "./lib/format";
import {
  buildPairProfile,
  loadPairIndex,
  pairSeries,
  type Direction,
  type PairIndex,
  type PairProfile,
  type PairSeries,
} from "./lib/pairProfile";
import type { EquitySource, ExposureNetwork } from "./lib/debtrank";
import { isFinancialCenter } from "./lib/financialCenters";
import {
  MAX_DELAY,
  clearScenarioFromUrl,
  fullAppUrl,
  isEmbedded,
  VIEWS,
  parseScenarioFromUrl,
  parseViewFromUrl,
  writeViewToUrl,
  type View,
  writeScenarioToUrl,
} from "./lib/scenarioUrl";
import { PRESETS } from "./lib/presets";

// Parsed once at module load (there's exactly one URL to read at startup);
// seeds the initial state below so a shared link reproduces its scenario.
const initialScenario = parseScenarioFromUrl();

// `?embed=1`: render the globe alone, for iframing into an article or a
// slide. Read once at module load for the same reason as the scenario --
// there is one URL, and nothing in the app changes this flag.
const embedded = isEmbedded();

// Loaded when its tab is first opened, so the Contagion view's bundle does not grow.
const StabilityView = lazy(() => import("./components/StabilityView"));

// Only "reserves" is a real observed figure -- the others are modeled
// proxies (see equityFor() in lib/network.ts for the full rationale).
const EQUITY_SOURCE_LABEL: Record<EquitySource, string> = {
  reserves: "Equity source: FX reserves (reported)",
  gdp: "Equity source: estimated from GDP (no reserves data)",
  capital_ratio: "Equity source: estimated from bank capital ratio (no reserves data)",
  floor: "Equity source: floor estimate (no reserves, GDP, or capital-ratio data)",
};

const glass =
  "border border-line/10 bg-[linear-gradient(145deg,rgba(10,23,39,0.82),rgba(3,9,18,0.72))] shadow-[0_24px_80px_rgba(0,0,0,0.3)] backdrop-blur-2xl";
const selectField = `${focus} min-w-0 appearance-none rounded-xl border ${hairline} bg-surface/45 px-3 py-2.5 text-[13px] text-fg-strong transition hover:border-accent/30`;
const range =
  "h-1 w-full cursor-pointer appearance-none rounded-full bg-slate-400/15 outline-none [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:cursor-pointer [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-accent [&::-moz-range-thumb]:shadow-[0_0_0_4px_rgba(56,189,248,0.16)] [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow-[0_0_0_4px_rgba(56,189,248,0.16)]";
// One scrollbar treatment for every scrolling region in the panel: the
// ranked list already had it inline, the controls column was left with the
// platform default, which on Windows is a wide light-grey bar painted over
// the values at the right edge.
const scrollArea =
  "overscroll-contain [scrollbar-color:rgba(56,189,248,0.28)_transparent] [scrollbar-width:thin] [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-accent/25 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5";

const nameOf = (id: string) => countries.find((c) => c.id === id)?.name ?? id;

const pct = (x: number | null) => (x === null ? null : `${(x * 100).toFixed(x < 0.1 ? 1 : 0)}%`);

function CountryPanel({
  id,
  profile,
  sourceLabel,
  onClose,
}: {
  id: string;
  profile: CountryProfile;
  sourceLabel: string;
  onClose: () => void;
}) {
  const row = (label: string, value: string | null) => (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-fg-subtle">{label}</dt>
      <dd className={`m-0 font-mono ${value === null ? "italic text-fg-subtle" : "text-fg"}`}>
        {value ?? "not reported"}
      </dd>
    </div>
  );
  const usd = (v: number | null) => (v === null ? null : formatUsd(v));
  const split = (a: { bank: number; portfolio: number }) =>
    `bank ${formatUsd(a.bank)} · portfolio ${formatUsd(a.portfolio)}`;
  const list = (title: string, rows: Counterparty[], count: number) => (
    <div className="flex flex-col gap-1.5">
      <span className={sectionLabel}>
        {title} ({count})
      </span>
      {rows.length === 0 ? (
        <p className="m-0 text-xs italic text-fg-subtle">none in this year&rsquo;s data</p>
      ) : (
        <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-0.5 text-xs">
              <span className="flex items-baseline justify-between gap-3">
                <span className="truncate text-fg">{nameOf(c.id)}</span>
                <span className="font-mono text-fg-muted tabular-nums">
                  {formatUsd(c.total)} &middot; {(c.share * 100).toFixed(0)}%
                </span>
              </span>
              <span className="font-mono text-[10px] text-fg-subtle">{split(c)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  return (
    <Panel data-testid="country-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 truncate text-sm font-semibold text-fg-strong">{nameOf(id)}</h2>
        <Button size="xs" className="shrink-0"
          onClick={onClose}
          aria-label="Close country details"
        >
          Close
        </Button>
      </div>
      <dl className="m-0 flex flex-col gap-1 text-xs">
        {row("GDP", usd(profile.gdp))}
        {row("FX reserves", usd(profile.reserves))}
        {row("External debt", usd(profile.externalDebt))}
        {row("External debt / GDP", pct(profile.externalDebtToGdp))}
        {row("Reserves / external debt", pct(profile.reservesToExternalDebt))}
        {row("Loss buffer used by the model", formatUsd(profile.equity))}
      </dl>
      <p className={note}>{sourceLabel}</p>
      <dl className="m-0 flex flex-col gap-1 text-xs">
        {row("Claims it holds", formatUsd(profile.claims.total))}
        {row("Claims held on it", formatUsd(profile.liabilities.total))}
        {row("Counterparties", String(profile.counterpartyCount))}
      </dl>
      {list("Creditors: hold claims on it", profile.creditors, profile.creditorCount)}
      {list("Debtors: it holds claims on", profile.debtors, profile.debtorCount)}
    </Panel>
  );
}

function PairPanel({
  a,
  b,
  profile,
  series,
  historyState,
  year,
  onClose,
}: {
  a: string;
  b: string;
  profile: PairProfile;
  series: PairSeries | null;
  historyState: "loading" | "failed" | "ready";
  year: number;
  onClose: () => void;
}) {
  const direction = (d: Direction) => (
    <div className="flex flex-col gap-0.5 text-xs">
      <span className="flex items-baseline justify-between gap-3">
        <span className="text-fg-muted">
          {nameOf(d.from)} on {nameOf(d.to)}
        </span>
        <span className="font-mono text-fg">{formatUsd(d.total)}</span>
      </span>
      <span className="font-mono text-[10px] text-fg-subtle">
        bank {formatUsd(d.bank)} &middot; portfolio {formatUsd(d.portfolio)}
      </span>
      <span className="font-mono text-[10px] text-fg-subtle">
        {d.total > 0 ? `${(d.impactRatio * 100).toFixed(1)}% of ${nameOf(d.from)}\u2019s loss buffer` : "no claim"}
      </span>
    </div>
  );

  return (
    <Panel data-testid="pair-panel">
      <div className="flex items-center justify-between gap-3">
        <h2 className="m-0 truncate text-sm font-semibold text-fg-strong">
          {nameOf(a)} &harr; {nameOf(b)}
        </h2>
        <Button size="xs" className="shrink-0"
          onClick={onClose}
          aria-label="Close pair view"
        >
          Close
        </Button>
      </div>
      <span className={sectionLabel}>Claims in {year}</span>
      {direction(profile.ab)}
      {direction(profile.ba)}
      <p className={note}>
        The impact ratio is what the current model run uses, so it follows the portfolio toggle; the
        amounts always show both layers.
      </p>
      {series ? (
        <PairSparkline series={series} year={year} nameA={nameOf(a)} nameB={nameOf(b)} />
      ) : (
        <p className={`${note} italic`}>
          {historyState === "loading"
            ? "Loading history\u2026"
            : historyState === "failed"
              ? "Couldn\u2019t load the pair history. Close and reopen to retry."
              : "No history indexed: this pair never reached $5B combined."}
        </p>
      )}
    </Panel>
  );
}

function App() {
  const [year, setYear] = useState(initialScenario?.year ?? DEFAULT_YEAR);
  const [displayYear, setDisplayYear] = useState(initialScenario?.year ?? DEFAULT_YEAR);
  const [yearData, setYearData] = useState<YearSnapshot | null>(null);
  const [yearLoading, setYearLoading] = useState(true);
  const yearDebounceRef = useRef<number | null>(null);

  const [shockedId, setShockedId] = useState<string | null>(initialScenario?.shocks[0]?.id ?? null);
  // Additional countries shocked alongside the primary one, each with the
  // propagation round it arrives in. The primary shock stays its own state
  // because the market panel, the globe highlight and the ranking
  // drill-down are all about one country and only make sense that way.
  const [extraShocks, setExtraShocks] = useState<ShockSpec[]>(initialScenario?.shocks.slice(1) ?? []);
  const [model, setModel] = useState<Model>(initialScenario?.model ?? "debtrank");
  const [magnitude, setMagnitude] = useState(initialScenario?.shocks[0]?.magnitude ?? 1.0);
  const [copied, setCopied] = useState(false);
  const [result, setResult] = useState<SimResult | null>(null);
  const [iteration, setIteration] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const timerRef = useRef<number | null>(null);

  const [analysisPoints, setAnalysisPoints] = useState<YearPoint[] | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<number | null>(null);
  // "View across years" runs 21 sequential fetch+solve rounds, and every
  // control that defines the scenario stays interactive throughout. A run
  // that is no longer the current one has to be dropped rather than
  // committed -- the same guard the year-loading effect gets from its
  // `cancelled` flag.
  const analysisRunRef = useRef(0);
  const [hideFinancialCenters, setHideFinancialCenters] = useState(false);
  const [includePortfolio, setIncludePortfolio] = useState(initialScenario?.includePortfolio ?? false);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [view, setView] = useState<View>(parseViewFromUrl);
  const changeView = (next: string) => {
    setView(next as View);
    writeViewToUrl(next as View);
  };
  const [pair, setPair] = useState<{ a: string; b: string } | null>(null);
  const [pairIndex, setPairIndex] = useState<PairIndex | null>(null);
  const [pairIndexFailed, setPairIndexFailed] = useState(false);
  // The two panels share one slot at the end of the controls, so opening
  // one closes the other.
  const openDetails = (id: string) => {
    setPair(null);
    setDetailId(id);
  };
  const openPair = (a: string, b: string) => {
    setDetailId(null);
    setPairIndexFailed(false);
    setPair({ a, b });
  };

  const profile = useMemo(
    () => (yearData && detailId ? buildCountryProfile(yearData, detailId) : null),
    [yearData, detailId],
  );
  const pairHistory = useMemo(
    () => (pairIndex && pair ? pairSeries(pairIndex, pair.a, pair.b) : null),
    [pairIndex, pair],
  );
  useEffect(() => {
    if (!pair || pairIndex) return;
    let cancelled = false;
    loadPairIndex()
      .then((index) => !cancelled && setPairIndex(index))
      .catch(() => !cancelled && setPairIndexFailed(true));
    return () => {
      cancelled = true;
    };
  }, [pair, pairIndex]);
  const detailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (detailId || pair) detailRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [detailId, pair]);

  const portfolioDataAvailable = (yearData?.portfolio_edges?.length ?? 0) > 0;

  const network = useMemo<ExposureNetwork | null>(
    () => (yearData ? buildExposureNetwork(yearData, { includePortfolio }) : null),
    [yearData, includePortfolio],
  );

  const pairProfile = useMemo(
    () => (yearData && network && pair ? buildPairProfile(yearData, network, pair.a, pair.b) : null),
    [yearData, network, pair],
  );

  const estimatedEquity = useMemo(
    () => network?.equitySource?.map((s) => s !== "reserves"),
    [network],
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

  /** The full scenario: the primary shock first, then the sequenced ones. */
  function shockList(id: string, mag: number, extras: ShockSpec[] = extraShocks): ShockSpec[] {
    return [{ id, magnitude: mag, delay: 0 }, ...extras.filter((e) => e.id !== id)];
  }

  function runShock(id: string, mag: number, mdl: Model, extras: ShockSpec[] = extraShocks) {
    if (!network || !baselineShortfall) return;
    if (timerRef.current) window.clearInterval(timerRef.current);
    setPanelOpen(true);
    setShockedId(id);
    setIteration(0);
    analysisRunRef.current++;
    setAnalysisPoints(null);
    setExpandedRowId(null);

    const res = computeShockResult(network, shockList(id, mag, extras), mdl, baselineShortfall);
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

  function updateExtras(next: ShockSpec[]) {
    setExtraShocks(next);
    if (shockedId) runShock(shockedId, magnitude, model, next);
  }

  function addExtraShock(id: string) {
    if (!id || id === shockedId || extraShocks.some((e) => e.id === id)) return;
    updateExtras([...extraShocks, { id, magnitude: 0.5, delay: 1 }]);
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
    // A pending year-slider debounce (see onYearChange) would otherwise fire
    // ~250ms later and silently overwrite this scenario's year with
    // whatever the slider was mid-drag to.
    if (yearDebounceRef.current) window.clearTimeout(yearDebounceRef.current);
    setModel(s.model);
    setMagnitude(s.magnitude);
    setDisplayYear(s.year);
    setShockedId(s.countryId);
    // The presets are single-country events; carrying someone's half-built
    // sequence into one would silently misattribute the result to it.
    setExtraShocks([]);
    if (s.year === year) {
      runShock(s.countryId, s.magnitude, s.model, []);
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
    setExtraShocks([]);
    setResult(null);
    setIteration(0);
    analysisRunRef.current++;
    setAnalysisPoints(null);
    setAnalysisLoading(false);
    setAnalysisProgress(null);
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
    const runId = ++analysisRunRef.current;
    setAnalysisLoading(true);
    setAnalysisProgress(YEARS[0]);
    const points = await runAnalysisAcrossYears(
      shockList(shockedId, magnitude),
      model,
      setAnalysisProgress,
      includePortfolio,
    );
    // Superseded while those 21 rounds were in flight -- whoever bumped the
    // token has already reset the panel; committing here would paint a
    // chart for a scenario that is no longer on screen.
    if (analysisRunRef.current !== runId) return;
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
    if (shockedId) writeScenarioToUrl({ year, shocks: shockList(shockedId, magnitude), model, includePortfolio });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, shockedId, magnitude, model, includePortfolio, extraShocks]);

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
    <div className="relative h-dvh w-full overflow-hidden bg-page font-sans text-fg-muted antialiased selection:bg-accent/20 selection:text-slate-50">
      <TabPanel id="contagion" idPrefix="view" active={view === "contagion"}>
      <div className="absolute inset-0">
        {yearData && view === "contagion" && (
          <Canvas camera={{ position: [0, 0, 5], fov: 45 }}>
            <Globe
              yearData={yearData}
              distress={distress}
              shockedId={shockedId}
              onSelect={triggerShock}
              estimatedEquity={estimatedEquity}
              sidebarOpen={panelOpen && !embedded}
              includePortfolio={includePortfolio}
            />
          </Canvas>
        )}
        {yearLoading && (
          <div className={`${glass} absolute bottom-5 left-5 z-10 rounded-xl px-3 py-1.5 font-mono text-xs text-fg-muted`}>
            Loading {displayYear}&hellip;
          </div>
        )}
      </div>
      </TabPanel>
      {!embedded && (
        <TabPanel id="stability" idPrefix="view" active={view === "stability"}>
          {view === "stability" && (
            <Suspense
              fallback={
                <div className="absolute inset-0 px-8 pt-28 font-mono text-xs text-fg-subtle" role="status">
                  Loading&hellip;
                </div>
              }
            >
              <StabilityView year={year} includePortfolio={includePortfolio} onIncludePortfolioChange={setIncludePortfolio} />
            </Suspense>
          )}
        </TabPanel>
      )}

      {/* The embed still has to say what it is showing and where it came
          from -- a globe with no caption is an unattributed illustration,
          and the year/model/country are the whole claim being made. */}
      {embedded && (
        <div className={`${glass} pointer-events-none absolute inset-x-3 bottom-3 z-10 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl px-3 py-2`}>
          <span className="font-mono text-[11px] text-fg-muted">
            {shockedId ? (
              <>
                <strong className="font-semibold text-fg-strong">
                  {countries.find((c) => c.id === shockedId)?.name ?? shockedId}
                </strong>
                {` shocked ${Math.round(magnitude * 100)}% · ${displayYear} · `}
                {model === "debtrank" ? "DebtRank" : "Eisenberg-Noe"}
                {includePortfolio ? " · incl. portfolio" : ""}
              </>
            ) : (
              <>Cross-border debt exposure network · {displayYear}</>
            )}
          </span>
          <a
            className={`${focus} pointer-events-auto font-mono text-[11px] text-accent underline decoration-accent/30 underline-offset-2 hover:decoration-accent`}
            href={fullAppUrl()}
            target="_blank"
            rel="noreferrer"
          >
            debtrank-globe &#8599;
          </a>
        </div>
      )}

      {!embedded && (
      <nav
        className={`${glass} fixed left-3 right-3 top-3 z-20 flex min-h-14 items-center justify-between rounded-2xl px-4 py-3 sm:left-4 sm:right-4 sm:top-4`}
      >
        <span className="font-mono text-[14.5px] font-semibold tracking-[-0.02em] text-fg-strong">
          debt<span className="text-accent">rank</span>
          <span className="text-fg-subtle">-globe</span>
        </span>
        <div className="flex min-w-0 flex-1 justify-center px-2">
          <Tabs tabs={VIEWS} value={view} onChange={changeView} label="Views" idPrefix="view" />
        </div>
        {view === "contagion" && (
        <IconButton className={`group flex-col gap-1 ${panelOpen ? "sm:hidden" : ""}`}
          aria-label={panelOpen ? "Close controls" : "Open controls"}
          aria-expanded={panelOpen}
          onClick={() => setPanelOpen((v) => !v)}
        >
          <span className="block h-px w-4 rounded-full bg-slate-100 transition duration-200 group-aria-expanded:translate-y-[5px] group-aria-expanded:rotate-45" />
          <span className="block h-px w-4 rounded-full bg-slate-100 transition duration-200 group-aria-expanded:opacity-0" />
          <span className="block h-px w-4 rounded-full bg-slate-100 transition duration-200 group-aria-expanded:-translate-y-[5px] group-aria-expanded:-rotate-45" />
        </IconButton>
        )}
      </nav>
      )}

      {!embedded && view === "contagion" && (
      <Drawer
        open={panelOpen}
        className="top-20 w-full gap-4 px-4 pb-5 pt-4 sm:top-0 sm:w-[380px] sm:gap-5 sm:px-6 sm:pb-6 sm:pt-5"
      >
        <div className="hidden shrink-0 items-center justify-between sm:flex">
          <span className={sectionLabel}>
            Controls
          </span>
          <IconButton
            aria-label="Close controls"
            onClick={() => setPanelOpen(false)}
          >
            <span className="relative block size-4">
              <span className="absolute left-0 top-1/2 block h-px w-4 -translate-y-1/2 rotate-45 rounded-full bg-current" />
              <span className="absolute left-0 top-1/2 block h-px w-4 -translate-y-1/2 -rotate-45 rounded-full bg-current" />
            </span>
          </IconButton>
        </div>

        <div
          data-testid="sidebar-controls"
          className={`${scrollArea} flex min-h-0 shrink flex-col gap-4 overflow-y-auto pr-1.5 sm:gap-5`}
        >
        <header className="flex shrink-0 flex-col gap-3">
          <span className={`${sectionLabel} text-accent`}>Systemic risk simulation</span>
          <p className="text-[13px] leading-5 text-fg-muted">
            Distress propagation over a real cross-border exposure network
            sourced from the World Bank and BIS. Click a country on the
            globe, or pick one below, to simulate a default.
          </p>
          <dl className={`mt-1 grid grid-cols-2 gap-4 border-t ${hairline} pt-4`}>
            <div>
              <dt className={sectionLabel}>Countries</dt>
              <dd className="mt-1.5 font-mono text-lg tabular-nums text-fg-strong">{countries.length}</dd>
            </div>
            <div>
              <dt className={sectionLabel}>Exposure edges</dt>
              <dd className="mt-1.5 font-mono text-lg tabular-nums text-fg-strong">
                {(yearData?.edges.length ?? 0).toLocaleString("en-US")}
              </dd>
            </div>
          </dl>
        </header>

        <Panel title="Network">

          <label className="flex flex-col gap-2.5 text-xs text-fg-muted">
            <span className="flex items-center justify-between">
              Year <strong className="font-mono text-sm font-medium text-fg-strong">{displayYear}</strong>
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

          <label
            className={`flex items-center gap-2 text-xs text-fg-muted ${
              portfolioDataAvailable ? "cursor-pointer" : "cursor-default opacity-40"
            }`}
          >
            <input
              type="checkbox"
              className={checkbox}
              checked={includePortfolio}
              disabled={!portfolioDataAvailable}
              onChange={(e) => setIncludePortfolio(e.target.checked)}
            />
            Include portfolio investment
            {!portfolioDataAvailable && <span className="font-mono text-fg-subtle">(no data for {displayYear})</span>}
          </label>
          <p className={`-mt-1 ${note}`}>
            Adds IMF CPIS cross-border bond/equity holdings as a second exposure
            layer alongside BIS bank-to-bank loans -- CPIS coverage currently
            ends around 2023.
          </p>
        </Panel>

        <Panel title="Scenario">

          <SegmentedToggle
            label="Contagion model"
            value={model}
            onChange={onModelChange}
            options={[
              { value: "debtrank", label: "DebtRank" },
              { value: "eisenberg-noe", label: "Eisenberg-Noe" },
            ]}
          />

          <div className="flex flex-col gap-1.5">
            <select
              className={selectField}
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
            <p className={note}>
              Illustrative shock magnitudes -- not empirically calibrated to actual losses.
            </p>
          </div>
          <select
            className={selectField}
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

          <label className="flex flex-col gap-2.5 text-xs text-fg-muted">
            <span className="flex items-center justify-between">
              Shock magnitude{" "}
              <strong className="font-mono text-sm font-medium text-fg-strong">
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

          {/* A sequence, not just a set: DebtRank's iterations are the only
              clock this model has, so "arrives in round N" is what "then
              Portugal, two rounds later" can honestly mean here. */}
          <div className="flex flex-col gap-2">
            {extraShocks.map((e, i) => (
              <div
                key={e.id}
                className={`flex items-center gap-2 rounded-xl border ${hairline} bg-surface/25 px-2.5 py-2`}
              >
                <span className="min-w-0 flex-1 truncate text-xs text-fg">
                  {countries.find((c) => c.id === e.id)?.name ?? e.id}
                </span>
                <label className="flex items-center gap-1 font-mono text-[11px] text-fg-muted">
                  <span className="sr-only">{`Magnitude for ${e.id}`}</span>
                  <input
                    className={`${focus} w-11 rounded-md border ${hairline} bg-surface/50 px-1 py-1 text-right text-fg-strong`}
                    type="number"
                    min={5}
                    max={100}
                    step={5}
                    value={Math.round(e.magnitude * 100)}
                    onChange={(ev) => {
                      const pct = Math.min(100, Math.max(5, Number(ev.target.value) || 5));
                      updateExtras(extraShocks.map((x, j) => (j === i ? { ...x, magnitude: pct / 100 } : x)));
                    }}
                  />
                  %
                </label>
                <label className="flex items-center gap-1 font-mono text-[11px] text-fg-muted">
                  <span className="sr-only">{`Arrival round for ${e.id}`}</span>
                  round
                  <input
                    className={`${focus} w-9 rounded-md border ${hairline} bg-surface/50 px-1 py-1 text-right text-fg-strong disabled:opacity-40`}
                    type="number"
                    min={0}
                    max={MAX_DELAY}
                    value={e.delay}
                    disabled={model !== "debtrank"}
                    onChange={(ev) => {
                      const d = Math.min(MAX_DELAY, Math.max(0, Math.trunc(Number(ev.target.value) || 0)));
                      updateExtras(extraShocks.map((x, j) => (j === i ? { ...x, delay: d } : x)));
                    }}
                  />
                </label>
                <IconButton size="sm"
                  aria-label={`Remove ${e.id} from the sequence`}
                  onClick={() => updateExtras(extraShocks.filter((_, j) => j !== i))}
                >
                  &times;
                </IconButton>
              </div>
            ))}

            <select
              className={`${focus} min-w-0 appearance-none rounded-xl border border-dashed border-line/15 bg-transparent px-3 py-2 text-xs text-fg-muted transition hover:border-accent/40 hover:text-fg-strong disabled:cursor-default disabled:opacity-35`}
              value=""
              disabled={!shockedId}
              onChange={(e) => addExtraShock(e.target.value)}
            >
              <option value="">+ Shock another country&hellip;</option>
              {sortedCountries
                .filter((c) => c.id !== shockedId && !extraShocks.some((e) => e.id === c.id))
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>

            {extraShocks.length > 0 && model !== "debtrank" && (
              <p className="text-[11px] leading-4 text-amber-300/80">
                Eisenberg-Noe solves a clearing fixed point, which has no
                propagation rounds -- every country above is shocked at once and
                the round numbers are ignored.
              </p>
            )}
          </div>


          <div className="flex gap-2">
            <Button size="md" className="flex-1"
              onClick={copyLink}
              disabled={!shockedId}
            >
              {copied ? "Copied" : "Copy link"}
            </Button>
            <Button size="md" className="flex-1"
              onClick={reset}
              disabled={!result}
            >
              Reset
            </Button>
          </div>
        </Panel>

        {result ? (
          <Panel title="Result">
            <div
              role="status"
              aria-live="polite"
              className={`flex items-center justify-between rounded-lg border ${hairline} bg-accent/[0.035] px-2.5 py-2 font-mono text-xs text-fg-muted`}
            >
              {result.kind === "debtrank" ? (
                <>
                  <span>
                    Iteration {iteration} / {result.history.length - 1}
                  </span>
                  <span>
                    impact <strong className="font-semibold text-warn">{result.debtrank.toFixed(4)}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span>Converged in {result.iterations} iterations</span>
                  <span>
                    shortfall <strong className="font-semibold text-warn">{result.aggregate.toFixed(4)}</strong>
                  </span>
                </>
              )}
            </div>

            {shockedId && (
              <div className={`flex flex-col gap-1.5 rounded-xl border ${hairline} bg-surface/25 px-3 py-2.5`}>
                <div className="flex items-center justify-between gap-3">
                  <span className={sectionLabel}>Market check ({year})</span>
                  <Button size="xs"
                    onClick={() => openDetails(shockedId)}
                  >
                    Country details
                  </Button>
                </div>
                <div className="flex flex-col gap-0.5 text-xs">
                  <span className="font-mono text-fg-muted [&_strong]:font-semibold [&_strong]:text-accent">
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
                      <span className="font-sans italic text-fg-subtle">no data</span>
                    )}
                  </span>
                  <span className="font-mono text-fg-muted [&_strong]:font-semibold [&_strong]:text-accent">
                    Policy rate{" "}
                    {getPolicyRate(shockedId, year) !== null ? (
                      <strong>{getPolicyRate(shockedId, year)?.toFixed(2)}%</strong>
                    ) : (
                      <span className="font-sans italic text-fg-subtle">no data</span>
                    )}
                  </span>
                  <span className="font-mono text-fg-muted [&_strong]:font-semibold [&_strong]:text-accent">
                    Stock index (YoY){" "}
                    {getStockChange(shockedId, year) !== null ? (
                      <strong>
                        {(getStockChange(shockedId, year)! >= 0 ? "+" : "")}
                        {getStockChange(shockedId, year)?.toFixed(1)}%
                      </strong>
                    ) : (
                      <span className="font-sans italic text-fg-subtle">no data</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {analysisPoints ? (
              <>
                <YearAnalysisChart points={analysisPoints} />
                <Button size="sm" tone="accent" className="self-start"
                  onClick={() => setAnalysisPoints(null)}
                >
                  Hide chart
                </Button>
              </>
            ) : (
              <Button size="sm" tone="accent" className="self-start"
                onClick={viewAcrossYears}
                disabled={analysisLoading}
              >
                {analysisLoading ? `Loading ${analysisProgress}…` : "View across years →"}
              </Button>
            )}
          </Panel>
        ) : (
          <Panel title="Distress scale">
            <div className="h-1.5 rounded-full bg-linear-to-r from-slate-700 via-warn to-danger" />
            <div className="-mt-1 flex justify-between text-[11px] text-fg-subtle">
              <span>no stress</span>
              <span>full stress</span>
            </div>
            <p className={note}>
              A stress index from 0 to 1, not a default probability: a country&rsquo;s losses
              on its banks&rsquo; cross-border claims, measured against a loss buffer that is
              usually central-bank FX reserves.
            </p>
            <p className={note}>
              A faint wireframe ring marks countries whose loss-buffer equity is
              estimated (GDP/capital-ratio/floor), not reported FX reserves.
            </p>
          </Panel>
        )}
        {((detailId && profile) || (pair && pairProfile)) && (
          <div ref={detailRef}>
            {detailId && profile && (
              <CountryPanel
                id={detailId}
                profile={profile}
                sourceLabel={EQUITY_SOURCE_LABEL[profile.equitySource]}
                onClose={() => setDetailId(null)}
              />
            )}
            {pair && pairProfile && (
              <PairPanel
                a={pair.a}
                b={pair.b}
                profile={pairProfile}
                series={pairHistory}
                historyState={pairIndex ? "ready" : pairIndexFailed ? "failed" : "loading"}
                year={year}
                onClose={() => setPair(null)}
              />
            )}
          </div>
        )}
        </div>

        {result && rankedAll.length > 0 && (
          <div className={`flex min-h-[38%] flex-1 flex-col overflow-hidden border-t ${hairline}`}>
            <div
              data-testid="ranking-header"
              className={`${sectionLabel} flex shrink-0 items-center justify-between py-3`}
            >
              <span>Propagation ranking</span>
              <span>{ranked.length} affected</span>
            </div>
            <div
              data-testid="ranked-results"
              className={`${scrollArea} min-h-[140px] flex-1 overflow-y-auto pr-1.5`}
            >
              <label className="flex shrink-0 cursor-pointer items-center gap-2 pb-2.5 text-[11px] text-fg-muted">
                <input
                  type="checkbox"
                  className={checkbox}
                  checked={hideFinancialCenters}
                  onChange={(e) => setHideFinancialCenters(e.target.checked)}
                />
                Hide financial centers
                {hideFinancialCenters && hiddenFinancialCenterCount > 0 && (
                  <span className="font-mono text-fg-subtle">({hiddenFinancialCenterCount} hidden)</span>
                )}
              </label>
              {!hideFinancialCenters && rankedAll.some((r) => isFinancialCenter(r.id)) && (
                <p className={`${note} mb-2.5`}>
                  Marked entries are cross-border financial centres (e.g. Isle
                  of Man, Hong Kong SAR) whose gross banking exposure runs to
                  multiples of local GDP -- they tend to rank high for almost
                  any shock. See{" "}
                  <a
                    className="underline decoration-slate-600 underline-offset-2 hover:text-accent"
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
                <p className={`${note} mb-2.5`}>
                  Hatched bars use estimated, not directly reported, loss-buffer
                  data -- hover a country for its exact source.
                </p>
              )}
              {ranked.length === 0 ? (
                <p className="pb-2 text-xs italic text-fg-subtle">
                  All affected countries are financial centers, hidden above.
                </p>
              ) : (
              <ol className="m-0 flex list-none flex-col gap-2.5 p-0">
                {ranked.map((r) => {
                  const canExpand = shockedId !== null && r.id !== shockedId;
                  return (
                  <li
                    key={r.id}
                    className={`group grid grid-cols-[minmax(0,1fr)_88px_44px] items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-xs transition-colors hover:bg-accent/[0.045] ${
                      canExpand ? "cursor-pointer" : ""
                    }`}
                    onClick={() => canExpand && setExpandedRowId((id) => (id === r.id ? null : r.id))}
                  >
                    <span
                      className={`truncate ${
                        r.id === shockedId ? "font-semibold text-warn" : "text-fg"
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
                      {isFinancialCenter(r.id) && <span className="ml-1 text-fg-subtle">*</span>}
                    </span>
                    <span className="relative h-1.5 overflow-hidden rounded-full bg-slate-400/12">
                      <span
                        className="absolute inset-0 origin-left rounded-full transition-transform duration-400"
                        style={{
                          transform: `scaleX(${r.level})`,
                          backgroundImage:
                            r.source && r.source !== "reserves"
                              ? "linear-gradient(to right, var(--distress-low), var(--distress-high)), repeating-linear-gradient(135deg, rgba(2,5,12,0.4) 0px, rgba(2,5,12,0.4) 2px, transparent 2px, transparent 5px)"
                              : "linear-gradient(to right, var(--distress-low), var(--distress-high))",
                        }}
                      />
                    </span>
                    <span className="text-right font-mono text-fg-muted tabular-nums">
                      {(r.level * 100).toFixed(1)}%
                    </span>
                    {expandedRowId === r.id && network && shockedId && (() => {
                      const shockedName = countries.find((c) => c.id === shockedId)?.name ?? shockedId;
                      const explanation = explainExposure(network, r.id, shockedId);
                      return (
                        <div className="col-span-3 -mt-1 flex flex-col gap-0.5 rounded-lg bg-surface/40 px-2.5 py-2 font-mono text-[11px] text-fg-muted">
                          {explanation.claimOnShocked > 0 || explanation.owedToShocked > 0 ? (
                            <>
                              {explanation.claimOnShocked > 0 && (
                                <span>
                                  Claim on {shockedName}:{" "}
                                  <strong className="text-fg">{formatUsd(explanation.claimOnShocked)}</strong>
                                  {" "}&middot; {(explanation.impactRatio * 100).toFixed(1)}% of its loss buffer
                                </span>
                              )}
                              {explanation.owedToShocked > 0 && (
                                <span>
                                  Owes {shockedName}:{" "}
                                  <strong className="text-fg">{formatUsd(explanation.owedToShocked)}</strong>
                                </span>
                              )}
                            </>
                          ) : explanation.viaPath ? (
                            <span className="font-sans italic">
                              No direct exposure -- likely indirect, via{" "}
                              {explanation.viaPath
                                .map((id) => countries.find((c) => c.id === id)?.name ?? id)
                                .join(" → ")}
                            </span>
                          ) : (
                            <span className="font-sans italic">
                              No direct or strongly-inferred indirect link in this year's data.
                            </span>
                          )}
                          <span className="mt-1 flex gap-3 font-sans text-[11px]">
                            <button
                              className={`${focus} text-accent underline decoration-slate-600 underline-offset-2 hover:text-accent-hover`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openDetails(r.id);
                              }}
                            >
                              Country details
                            </button>
                            <button
                              className={`${focus} text-accent underline decoration-slate-600 underline-offset-2 hover:text-accent-hover`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openPair(r.id, shockedId);
                              }}
                            >
                              Pair view
                            </button>
                          </span>
                        </div>
                      );
                    })()}
                  </li>
                  );
                })}
              </ol>
              )}
            </div>
          </div>
        )}
      </Drawer>
      )}
    </div>
  );
}

export default App;
