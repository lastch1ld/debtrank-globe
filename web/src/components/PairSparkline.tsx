import { formatUsd } from "../lib/format";
import { sparklinePoints, type PairSeries } from "../lib/pairProfile";

const W = 300;
const H = 56;

/** Two lines on one scale: each country's claim on the other, by year, with
 * the selected year marked. Plain SVG, no chart library. */
export function PairSparkline({
  series,
  year,
  nameA,
  nameB,
}: {
  series: PairSeries;
  year: number;
  nameA: string;
  nameB: string;
}) {
  const max = Math.max(...series.aOnB, ...series.bOnA);
  const last = series.firstYear + series.aOnB.length - 1;
  const markerX = ((year - series.firstYear) / (last - series.firstYear)) * W;
  return (
    <figure className="m-0 flex flex-col gap-1.5" data-testid="pair-sparkline">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-14 w-full overflow-visible"
        role="img"
        aria-label={`${nameA} and ${nameB} claims on each other, ${series.firstYear} to ${last}, peak ${formatUsd(max)}`}
        preserveAspectRatio="none"
      >
        <line
          x1={markerX}
          x2={markerX}
          y1={0}
          y2={H}
          className="stroke-slate-500"
          strokeDasharray="2 3"
        />
        <polyline
          fill="none"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="stroke-sky-400"
          points={sparklinePoints(series.aOnB, W, H, max)}
        />
        <polyline
          fill="none"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          className="stroke-amber-400"
          points={sparklinePoints(series.bOnA, W, H, max)}
        />
      </svg>
      <div className="flex justify-between font-mono text-[10px] text-slate-500">
        <span>{series.firstYear}</span>
        <span>peak {formatUsd(max)}</span>
        <span>{last}</span>
      </div>
      <figcaption className="flex flex-col gap-0.5 text-[11px] text-slate-400">
        <span>
          <span className="text-sky-400">&mdash;</span> {nameA}&rsquo;s claim on{" "}
          {nameB}
        </span>
        <span>
          <span className="text-amber-400">&mdash;</span> {nameB}&rsquo;s claim
          on {nameA}
        </span>
      </figcaption>
    </figure>
  );
}
