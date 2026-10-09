import { useEffect, useState } from "react";
import { YEARS } from "../lib/network";
import { computeStability, type StabilityPoint } from "../lib/stability";
import { Panel, checkbox, note, sectionLabel } from "../ui";

const W = 480;
const H = 240;
const M = { left: 40, right: 12, top: 12, bottom: 28 };

interface Props {
  /** The year picked on the Contagion view, marked on the chart. */
  year: number;
  includePortfolio: boolean;
  onIncludePortfolioChange: (on: boolean) => void;
}

export default function StabilityView({
  year,
  includePortfolio,
  onIncludePortfolioChange,
}: Props) {
  // Progress and result belong to one toggle setting; a different setting
  // starts from nothing, derived here rather than reset inside the effect.
  const [run, setRun] = useState<{
    for: boolean;
    done: number;
    points?: StabilityPoint[];
    failed?: boolean;
  } | null>(null);
  const current = run?.for === includePortfolio ? run : null;
  const points = current?.points ?? null;
  const done = current?.done ?? 0;
  const failed = current?.failed ?? false;

  useEffect(() => {
    let cancelled = false;
    computeStability(
      includePortfolio,
      (n) => !cancelled && setRun({ for: includePortfolio, done: n }),
      () => cancelled,
    )
      .then(
        (p) =>
          !cancelled &&
          setRun({ for: includePortfolio, done: p.length, points: p }),
      )
      .catch(
        () =>
          !cancelled &&
          setRun({ for: includePortfolio, done: 0, failed: true }),
      );
    return () => {
      cancelled = true;
    };
  }, [includePortfolio]);

  return (
    <div className="absolute inset-0 overflow-y-auto px-4 pb-10 pt-24 sm:px-8 sm:pt-28">
      <div className="mx-auto flex max-w-3xl flex-col gap-5">
        <header className="flex flex-col gap-2">
          <h1 className="m-0 text-lg font-semibold text-fg-strong">
            Network stability
          </h1>
          <p className="m-0 max-w-prose text-[13px] leading-5 text-fg-muted">
            One number per year for the whole network: the largest eigenvalue
            (spectral radius) of the matrix of impact ratios, the share of each
            country&rsquo;s loss buffer that its claims on each other country
            would use up. In a cascade where every country keeps passing
            distress on, distress shrinks round by round below 1 and can grow
            above it.
          </p>
        </header>

        <label className="flex cursor-pointer items-center gap-2 text-xs text-fg-muted">
          <input
            type="checkbox"
            className={checkbox}
            checked={includePortfolio}
            onChange={(e) => onIncludePortfolioChange(e.target.checked)}
          />
          Include portfolio investment
          <span className="font-mono text-fg-subtle">(no data after 2023)</span>
        </label>

        <Panel title="Spectral radius by year">
          {failed ? (
            <p className={`${note} italic`}>
              Couldn&rsquo;t load the yearly files. Reload to retry.
            </p>
          ) : points ? (
            <Chart points={points} year={year} />
          ) : (
            <p className={`${note} italic`} role="status">
              Loading {done} / {YEARS.length} years&hellip;
            </p>
          )}
        </Panel>

        <p className={note}>
          How to read it: the DebtRank in this app lets each country pass
          distress on only once, so this is a summary of how tightly the network
          is wired, not a forecast of any scenario. Buffers come from the same
          fallback chain as everywhere else, so a country with an estimated
          buffer moves the number as well. The level is far above 1 in every
          year, and stays well above 1 with the cross-border financial centres
          left out, so read the shape of the line across years, not its distance
          from 1. Whether it rises before 2008 or 2010 is something to look at,
          not a finding.
        </p>
      </div>
    </div>
  );
}

function Chart({ points, year }: { points: StabilityPoint[]; year: number }) {
  const max = Math.max(...points.map((p) => p.radius));
  const top = Math.max(1.2, max * 1.1);
  // Whole-number gridlines; the 1.0 line is drawn separately because it is
  // the one the text talks about.
  const tickStep = top > 6 ? 2 : 1;
  const x = (i: number) =>
    M.left + (i * (W - M.left - M.right)) / (points.length - 1);
  const y = (v: number) => M.top + (1 - v / top) * (H - M.top - M.bottom);
  const peak = points.reduce((a, b) => (b.radius > a.radius ? b : a));
  const selected = points.findIndex((p) => p.year === year);

  return (
    <figure className="m-0 flex flex-col gap-2" data-testid="stability-chart">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full max-w-[600px]"
        role="img"
        aria-label={`Spectral radius of the impact matrix, ${points[0].year} to ${points[points.length - 1].year}; highest ${peak.radius.toFixed(2)} in ${peak.year}`}
      >
        {Array.from(
          { length: Math.floor(top / tickStep) + 1 },
          (_, k) => k * tickStep,
        )
          .filter((v) => v !== 1)
          .map((v) => (
            <g key={v}>
              <line
                x1={M.left}
                x2={W - M.right}
                y1={y(v)}
                y2={y(v)}
                className="stroke-line/15"
              />
              <text
                x={M.left - 6}
                y={y(v) + 4}
                textAnchor="end"
                className="fill-fg-subtle font-mono text-[11px]"
              >
                {v}
              </text>
            </g>
          ))}
        <line
          x1={M.left}
          x2={W - M.right}
          y1={y(1)}
          y2={y(1)}
          strokeDasharray="4 4"
          className="stroke-warn"
        />
        <text
          x={M.left - 6}
          y={y(1) + 3}
          textAnchor="end"
          className="fill-warn font-mono text-[11px]"
        >
          1.0
        </text>
        {selected >= 0 && (
          <line
            x1={x(selected)}
            x2={x(selected)}
            y1={M.top}
            y2={H - M.bottom}
            strokeDasharray="2 3"
            className="stroke-fg-subtle"
          />
        )}
        <polyline
          fill="none"
          strokeWidth={1.75}
          className="stroke-accent"
          points={points
            .map((p, i) => `${x(i).toFixed(1)},${y(p.radius).toFixed(1)}`)
            .join(" ")}
        />
        {points.map((p, i) => (
          <circle
            key={p.year}
            cx={x(i)}
            cy={y(p.radius)}
            r={2.5}
            className="fill-accent"
          />
        ))}
        {points.map((p, i) =>
          p.year % 5 === 0 ? (
            <text
              key={p.year}
              x={x(i)}
              y={H - 8}
              textAnchor="middle"
              className="fill-fg-subtle font-mono text-[11px]"
            >
              {p.year}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="flex flex-wrap justify-between gap-x-4 gap-y-1">
        <span className={sectionLabel}>
          highest {peak.radius.toFixed(2)} in {peak.year}
        </span>
        <span className={sectionLabel}>
          {points[points.length - 1].year}:{" "}
          {points[points.length - 1].radius.toFixed(2)}
        </span>
      </figcaption>
    </figure>
  );
}
