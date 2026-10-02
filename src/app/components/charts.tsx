import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { HeatCell } from '../../metrics';

function useWidth<T extends HTMLElement>(fallback = 300) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setW(Math.max(40, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const shortDate = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

/* ---------------- Ring ---------------- */
export function Ring({ ratio, size = 96, stroke = 9, color, children, label }: { ratio: number | null; size?: number; stroke?: number; color: string; children?: ReactNode; label: string }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(ratio ?? 0));
    return () => cancelAnimationFrame(id);
  }, [ratio]);
  return (
    <div className={`ring-wrap${ratio != null && ratio >= 1 ? ' complete' : ''}`} style={{ width: size, height: size, ['--ring' as string]: color }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle className="ring-track" cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} />
        {ratio != null && (
          <circle
            className="ring-fill"
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - Math.max(0, Math.min(1, shown)))}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

/* ---------------- Sparkline ---------------- */
export function Sparkline({
  series,
  color,
  height = 44,
  area = true,
  format = (v) => String(v),
  label,
}: {
  series: { date: string; value: number | null }[];
  color: string;
  height?: number;
  area?: boolean;
  format?: (v: number) => string;
  label: string;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const pts = series.map((s, i) => ({ ...s, i }));
  const vals = pts.map((p) => p.value).filter((v): v is number => v != null);
  if (vals.length === 0) return <div className="chart" style={{ height }} aria-label={`${label}: no data`} />;
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  const pad = 4;
  const x = (i: number) => (series.length <= 1 ? w / 2 : pad + (i / (series.length - 1)) * (w - pad * 2));
  const y = (v: number) => (max === min ? height / 2 : height - pad - ((v - min) / (max - min)) * (height - pad * 2));
  const segs: string[] = [];
  let cur = '';
  for (const p of pts) {
    if (p.value == null) {
      if (cur) segs.push(cur);
      cur = '';
      continue;
    }
    cur += `${cur ? 'L' : 'M'}${x(p.i).toFixed(1)},${y(p.value).toFixed(1)}`;
  }
  if (cur) segs.push(cur);
  const lastIdx = [...pts].reverse().find((p) => p.value != null)!.i;
  const firstIdx = pts.find((p) => p.value != null)!.i;
  const areaPath = segs.length === 1 ? `${segs[0]}L${x(lastIdx)},${height}L${x(firstIdx)},${height}Z` : null;
  const hp = hover != null ? pts[hover] : null;

  return (
    <div
      className="chart"
      ref={ref}
      style={{ height }}
      onMouseLeave={() => setHover(null)}
      onMouseMove={(e) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const i = Math.round(((e.clientX - rect.left - pad) / (w - pad * 2)) * (series.length - 1));
        setHover(Math.max(0, Math.min(series.length - 1, i)));
      }}
      role="img"
      aria-label={`${label}: latest ${format(vals[vals.length - 1]!)}`}
    >
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        {area && areaPath && <path d={areaPath} fill={color} opacity={0.1} />}
        {segs.map((d, i) => (
          <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        ))}
        <circle cx={x(lastIdx)} cy={y(pts[lastIdx]!.value!)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />
        {hp && (
          <>
            <line x1={x(hp.i)} x2={x(hp.i)} y1={0} y2={height} stroke="var(--border-strong)" />
            {hp.value != null && <circle cx={x(hp.i)} cy={y(hp.value)} r={4} fill={color} stroke="var(--surface)" strokeWidth={2} />}
          </>
        )}
      </svg>
      {hp && (
        <div className="tip" style={{ left: x(hp.i), top: hp.value != null ? y(hp.value) : height / 2 }}>
          {hp.value != null ? format(hp.value) : 'No data'}
          <small>{shortDate(hp.date)}</small>
        </div>
      )}
    </div>
  );
}

/* ---------------- Columns ---------------- */
export function Columns({
  series,
  color,
  height = 120,
  format = (v) => String(v),
  label,
  xLabel = shortDate,
  target,
}: {
  series: { date: string; value: number | null }[];
  color: string;
  height?: number;
  format?: (v: number) => string;
  label: string;
  xLabel?: (d: string) => string;
  target?: number | null;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const axisH = 18;
  const plotH = height - axisH;
  const max = Math.max(1, target ?? 0, ...series.map((s) => s.value ?? 0));
  const slot = w / Math.max(1, series.length);
  const bw = Math.max(3, Math.min(24, slot - 2));
  const y = (v: number) => plotH - (v / max) * (plotH - 6);
  return (
    <div className="chart" ref={ref} style={{ height }} onMouseLeave={() => setHover(null)} role="img" aria-label={`${label}, ${series.length} periods`}>
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        <line className="grid-line" x1={0} x2={w} y1={plotH + 0.5} y2={plotH + 0.5} />
        {target != null && <line x1={0} x2={w} y1={y(target)} y2={y(target)} stroke="var(--text-3)" strokeDasharray="3 4" strokeWidth={1} />}
        {series.map((s, i) => {
          const cx = slot * i + slot / 2;
          const v = s.value;
          if (v == null) return <rect key={s.date} x={cx - bw / 2} y={plotH - 2} width={bw} height={2} fill="var(--grid)" />;
          const top = y(v);
          const h = plotH - top;
          const r = Math.min(4, bw / 2, h);
          const d = h <= 0 ? '' : `M${cx - bw / 2},${plotH}V${top + r}Q${cx - bw / 2},${top} ${cx - bw / 2 + r},${top}H${cx + bw / 2 - r}Q${cx + bw / 2},${top} ${cx + bw / 2},${top + r}V${plotH}Z`;
          return (
            <g key={s.date} onMouseEnter={() => setHover(i)}>
              <rect x={slot * i} y={0} width={slot} height={plotH} fill="transparent" />
              {d && <path d={d} fill={color} opacity={hover == null || hover === i ? 1 : 0.55} />}
            </g>
          );
        })}
        {series.length > 0 && (
          <>
            <text className="axis-label" x={2} y={height - 4}>
              {xLabel(series[0]!.date)}
            </text>
            <text className="axis-label" x={w - 2} y={height - 4} textAnchor="end">
              {xLabel(series[series.length - 1]!.date)}
            </text>
          </>
        )}
      </svg>
      {hover != null && series[hover] && (
        <div className="tip" style={{ left: slot * hover + slot / 2, top: series[hover]!.value != null ? y(series[hover]!.value!) : plotH }}>
          {series[hover]!.value != null ? format(series[hover]!.value!) : 'No data'}
          <small>{xLabel(series[hover]!.date)}</small>
        </div>
      )}
    </div>
  );
}

/* ---------------- Heatmap / streak calendar ---------------- */
export function Heatmap({ cells, color, today, label }: { cells: HeatCell[]; color: string; today: string; label: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const fill = (v: number | null) => (v == null ? undefined : v === 0 ? 'var(--surface-3)' : `color-mix(in oklab, ${color} ${Math.round(28 + v * 72)}%, var(--surface-2))`);
  const recorded = cells.filter((c) => c.value != null).length;
  return (
    <div className="chart" onMouseLeave={() => setTip(null)}>
      <div className="heat" role="img" aria-label={`${label}: ${recorded} of ${cells.filter((c) => c.date <= today).length} days recorded`}>
        {cells.map((c) => (
          <div
            key={c.date}
            className={`cell${c.date > today ? ' future' : c.value == null ? ' none' : ''}${c.date === today ? ' today' : ''}`}
            style={{ background: c.date > today ? undefined : fill(c.value) }}
            title={c.label}
            onMouseEnter={(e) => {
              const parent = e.currentTarget.parentElement!.getBoundingClientRect();
              const r = e.currentTarget.getBoundingClientRect();
              setTip({ x: r.left - parent.left + r.width / 2, y: r.top - parent.top, text: c.label });
            }}
          />
        ))}
      </div>
      {tip && (
        <div className="tip" style={{ left: tip.x, top: tip.y }}>
          {tip.text}
        </div>
      )}
      <div className="heat-legend">
        <span className="cell" style={{ boxShadow: 'inset 0 0 0 1px var(--border)' }} /> no record
        <span style={{ marginLeft: 8 }}>less</span>
        {[0, 0.33, 0.66, 1].map((v) => (
          <span key={v} className="cell" style={{ background: fill(v) }} />
        ))}
        <span>more</span>
      </div>
    </div>
  );
}

/* ---------------- Meter & horizontal bars ---------------- */
export function Meter({ ratio, color, label }: { ratio: number; color: string; label: string }) {
  return (
    <div className="meter" style={{ ['--m' as string]: color }} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)}>
      <span style={{ width: `${Math.max(0, Math.min(1, ratio)) * 100}%` }} />
    </div>
  );
}

export function HBars({ rows, color, label }: { rows: { label: string; value: number; color?: string }[]; color: string; label: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div role="list" aria-label={label}>
      {rows.map((r) => (
        <div className="hbar" role="listitem" key={r.label}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
          <div className="track">
            <div className="fill" style={{ width: `${(r.value / max) * 100}%`, background: r.color ?? color }} />
          </div>
          <span className="num" style={{ textAlign: 'right', fontWeight: 600 }}>
            {r.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Dot strip (binary daily series) ---------------- */
export function DotStrip({ series, color, label }: { series: { date: string; value: number | null }[]; color: string; label: string }) {
  const done = series.filter((s) => s.value === 1).length;
  const recorded = series.filter((s) => s.value != null).length;
  return (
    <div className="dots" role="img" aria-label={`${label}: done ${done} of ${recorded} recorded days`} style={{ ['--dot' as string]: color }}>
      {series.map((s) => (
        <span key={s.date} className={s.value == null ? 'none' : s.value ? 'on' : ''} title={`${shortDate(s.date)}: ${s.value == null ? 'no record' : s.value ? 'done' : 'missed'}`} />
      ))}
    </div>
  );
}
