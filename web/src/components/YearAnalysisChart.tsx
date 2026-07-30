import { useMemo, useState } from "react";
import type { YearPoint } from "../lib/analysis";

interface Series {
  key: "modelImpact" | "bondYield" | "policyRate" | "stockChange";
  label: string;
  unit: string;
  color: string;
  format: (v: number) => string;
}

// Model impact is the reference line (our prediction), so it gets a neutral
// achromatic treatment rather than competing for a 4th categorical hue --
// the dataviz skill's own validator confirms this hue family can't clear
// CVD-safety past 3 slots (yellow/orange collide), so the 3 real market
// series get the validated categorical order and the reference series
// gets shape (filled area, thicker stroke), not another hue.
const SERIES: Series[] = [
  {
    key: "modelImpact",
    label: "Model impact",
    unit: "",
    color: "#e7ecf5",
    format: (v) => v.toFixed(3),
  },
  {
    key: "bondYield",
    label: "10Y bond yield",
    unit: "%",
    color: "#3987e5",
    format: (v) => `${v.toFixed(2)}%`,
  },
  {
    key: "policyRate",
    label: "Policy rate",
    unit: "%",
    color: "#d95926",
    format: (v) => `${v.toFixed(2)}%`,
  },
  {
    key: "stockChange",
    label: "Stock index YoY",
    unit: "%",
    color: "#199e70",
    format: (v) => `${v.toFixed(1)}%`,
  },
];

const WIDTH = 312;
const BAND_HEIGHT = 54;
const BAND_GAP = 6;
const LABEL_HEIGHT = 14;
const PLOT_HEIGHT = BAND_HEIGHT - LABEL_HEIGHT;
const TOTAL_HEIGHT = SERIES.length * (BAND_HEIGHT + BAND_GAP) - BAND_GAP;

function xFor(index: number, count: number): number {
  return count <= 1 ? 0 : (index / (count - 1)) * WIDTH;
}

function buildPath(values: (number | null)[]): string {
  let d = "";
  let drawing = false;
  const min = Math.min(...(values.filter((v): v is number => v !== null)));
  const max = Math.max(...(values.filter((v): v is number => v !== null)));
  const span = max - min || 1;
  values.forEach((v, i) => {
    if (v === null) {
      drawing = false;
      return;
    }
    const x = xFor(i, values.length);
    const y = PLOT_HEIGHT - ((v - min) / span) * PLOT_HEIGHT;
    d += drawing ? ` L ${x.toFixed(1)} ${y.toFixed(1)}` : `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    drawing = true;
  });
  return d;
}

function rangeLabel(values: (number | null)[], format: (v: number) => string): string {
  const finite = values.filter((v): v is number => v !== null);
  if (finite.length === 0) return "no data";
  return `${format(Math.min(...finite))} – ${format(Math.max(...finite))}`;
}

export function YearAnalysisChart({ points }: { points: YearPoint[] }) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const byKey = useMemo(() => {
    const out: Record<Series["key"], (number | null)[]> = {
      modelImpact: [],
      bondYield: [],
      policyRate: [],
      stockChange: [],
    };
    for (const p of points) {
      out.modelImpact.push(p.modelImpact);
      out.bondYield.push(p.bondYield);
      out.policyRate.push(p.policyRate);
      out.stockChange.push(p.stockChange);
    }
    return out;
  }, [points]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * WIDTH;
    const idx = Math.round((relX / WIDTH) * (points.length - 1));
    setHoverIndex(Math.min(points.length - 1, Math.max(0, idx)));
  }

  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  const crosshairX = hoverIndex !== null ? xFor(hoverIndex, points.length) : null;

  return (
    <div className="analysis-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${TOTAL_HEIGHT}`}
        width="100%"
        onMouseMove={onMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        {SERIES.map((series, bandIndex) => {
          const values = byKey[series.key];
          const bandY = bandIndex * (BAND_HEIGHT + BAND_GAP);
          return (
            <g key={series.key} transform={`translate(0, ${bandY})`}>
              <text x={0} y={10} className="analysis-chart-label" fill={series.color}>
                {series.label}
              </text>
              <text x={WIDTH} y={10} textAnchor="end" className="analysis-chart-range">
                {rangeLabel(values, series.format)}
              </text>
              <g transform={`translate(0, ${LABEL_HEIGHT})`}>
                <line x1={0} y1={PLOT_HEIGHT} x2={WIDTH} y2={PLOT_HEIGHT} className="analysis-chart-baseline" />
                <path
                  d={buildPath(values)}
                  fill="none"
                  stroke={series.color}
                  strokeWidth={series.key === "modelImpact" ? 2.25 : 1.75}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            </g>
          );
        })}

        {crosshairX !== null && (
          <line
            x1={crosshairX}
            y1={0}
            x2={crosshairX}
            y2={TOTAL_HEIGHT}
            className="analysis-chart-crosshair"
          />
        )}
      </svg>

      <div className="analysis-chart-x-labels">
        <span>{points[0]?.year}</span>
        <span>{points[points.length - 1]?.year}</span>
      </div>

      {hover && (
        <div className="analysis-chart-tooltip">
          <strong>{hover.year}</strong>
          {SERIES.map((series) => {
            const v = hover[series.key];
            return (
              <span key={series.key} style={{ color: series.color }}>
                {series.label}: {v === null ? "—" : series.format(v)}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
