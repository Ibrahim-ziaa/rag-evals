import { useState } from "react";

/** Single series sparkline. The last point is the current value, so it gets the dot. */
export function Sparkline({ values, width = 132, height = 34 }: { values: number[]; width?: number; height?: number }) {
  if (values.length < 2) return null;
  const pad = 4;
  // scaled to the series, with a minimum span of 0.2 so a flat measure still reads as flat
  const lo = Math.min(...values), hi = Math.max(...values);
  const span = Math.max(0.2, hi - lo);
  const min = (lo + hi) / 2 - span / 2, max = (lo + hi) / 2 + span / 2;
  const x = (i: number) => pad + (i * (width - pad * 2)) / (values.length - 1);
  const y = (v: number) => height - pad - ((v - min) / (max - min)) * (height - pad * 2);
  const d = values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = values.length - 1;
  return (
    <svg width={width} height={height} role="img" aria-label={`Trend over ${values.length} runs, from ${values[0].toFixed(2)} to ${values[last].toFixed(2)}`}>
      <path d={d} fill="none" stroke="var(--color-ink-3)" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(last)} cy={y(values[last])} r={3.5} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2} />
    </svg>
  );
}

export interface TrendPoint { id: string; label: string; sub: string; value: number; failed: boolean; baseline: boolean }

/** Questions passing per run. One series, one axis, direct labels, hover detail. */
export function TrendChart({ points, total, baselineValue }: { points: TrendPoint[]; total: number; baselineValue: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1560, H = 236, L = 40, R = 30, T = 26, B = 46;
  const x = (i: number) => L + (points.length === 1 ? 0 : (i * (W - L - R)) / (points.length - 1));
  const y = (v: number) => T + (1 - v / total) * (H - T - B);
  const ticks = [0, total / 2, total];
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i)},${y(p.value)}`).join(" ");
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block w-full" role="img" aria-label="Questions passing per evaluation run">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" strokeWidth={1} />
            <text x={L - 10} y={y(t) + 4} textAnchor="end" fontSize={13} fill="var(--color-ink-3)" className="tnum">{t}</text>
          </g>
        ))}
        <line x1={L} x2={W - R} y1={y(baselineValue)} y2={y(baselineValue)} stroke="var(--color-ink-3)" strokeWidth={1} strokeDasharray="4 4" />
        <text x={L + 4} y={y(baselineValue) - 7} fontSize={13} fill="var(--color-ink-2)">Baseline: {baselineValue} passing</text>
        <path d={d} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => (
          <g key={p.id}>
            {hover === i && <line x1={x(i)} x2={x(i)} y1={T - 6} y2={H - B} stroke="var(--color-line-strong)" strokeWidth={1} />}
            <circle cx={x(i)} cy={y(p.value)} r={hover === i ? 6 : 4.5} fill={p.failed ? "var(--color-panel)" : "var(--color-accent)"} stroke={p.failed ? "var(--color-accent)" : "var(--color-panel)"} strokeWidth={2} />
            {(i === 0 || i === points.length - 1 || p.baseline || hover === i) && (
              <text x={x(i)} y={y(p.value) - 12} textAnchor="middle" fontSize={14} fontWeight={600} fill="var(--color-ink)" className="tnum">{p.value}</text>
            )}
            <text x={x(i)} y={H - B + 20} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={13} fill="var(--color-ink-2)" fontWeight={hover === i ? 600 : 400}>{p.label}</text>
            <text x={x(i)} y={H - B + 36} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} fontSize={12.5} fill="var(--color-ink-3)">{p.sub}</text>
            <rect x={x(i) - (W - L - R) / points.length / 2} y={0} width={(W - L - R) / points.length} height={H} fill="transparent"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />
          </g>
        ))}
      </svg>
      <div className="mt-1 flex items-center gap-5 pl-10 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="var(--color-accent)" /></svg>Run at or above baseline</span>
        <span className="inline-flex items-center gap-1.5"><svg width="12" height="12"><circle cx="6" cy="6" r="3.5" fill="var(--color-panel)" stroke="var(--color-accent)" strokeWidth="2" /></svg>Run that fails the gate</span>
      </div>
    </div>
  );
}

/** Before and after on one 0 to 1 scale: open ink ring is before, solid plum dot is after. */
export function Dumbbell({ before, after, width = 220 }: { before: number; after: number; width?: number }) {
  const pad = 6, h = 18;
  const x = (v: number) => pad + v * (width - pad * 2);
  return (
    <svg width={width} height={h} role="img" aria-label={`Before ${before.toFixed(2)}, after ${after.toFixed(2)}`}>
      <line x1={pad} x2={width - pad} y1={h / 2} y2={h / 2} stroke="var(--color-line)" strokeWidth={2} strokeLinecap="round" />
      <line x1={x(before)} x2={x(after)} y1={h / 2} y2={h / 2} stroke={after >= before ? "var(--color-accent)" : "var(--color-bad)"} strokeWidth={2} opacity={0.6} />
      <circle cx={x(before)} cy={h / 2} r={3.75} fill="var(--color-panel)" stroke="var(--color-ink-2)" strokeWidth={1.75} />
      <circle cx={x(after)} cy={h / 2} r={5} fill="var(--color-accent)" stroke="var(--color-panel)" strokeWidth={2} />
    </svg>
  );
}
