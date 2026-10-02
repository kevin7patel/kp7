import { useEffect, useRef, useState, type ReactNode } from 'react';
import { areaLabel } from '../../shared/areas';
import type { MetricValue, Quality, Task } from '../../shared/types';
import { dueLabel, fmtDateTime, fmtNum, STATUS_META } from '../format';
import { Sparkline } from './charts';
import { Icon } from './Icon';

export function Card({ title, hint, icon, color, right, children, className = '', flat }: { title?: ReactNode; hint?: ReactNode; icon?: string; color?: string; right?: ReactNode; children: ReactNode; className?: string; flat?: boolean }) {
  return (
    <section className={`card${flat ? ' flat' : ''} ${className}`}>
      {(title || right) && (
        <div className="card-head">
          {color && <span className="swatch" style={{ background: color }} />}
          {icon && !color && <Icon name={icon} size={16} />}
          {title && <h3>{title}</h3>}
          {hint && <span className="hint">{hint}</span>}
          {right && <div className="right">{right}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

const Q_LABEL: Record<Quality, string> = { real: 'Notion', derived: 'Derived', demo: 'Demo', missing: 'No data' };

export function ProvenanceChip({ m }: { m: Pick<MetricValue, 'label' | 'quality' | 'source' | 'calculation' | 'period' | 'unit' | 'lastUpdated' | 'note'> }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  return (
    <span className="pop-wrap" ref={ref}>
      <button type="button" className={`chip q-${m.quality}`} aria-expanded={open} aria-label={`${m.label}: ${Q_LABEL[m.quality]} — show source details`} onClick={() => setOpen((o) => !o)}>
        <span className="d" />
        <span className="chip-text">{Q_LABEL[m.quality]}</span>
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label={`${m.label} details`}>
          <div className="pop-title">{m.label}</div>
          <dl>
            <dt>Status</dt>
            <dd>{m.quality === 'real' ? 'Connected Notion value' : m.quality === 'derived' ? 'Calculated from Notion records' : m.quality === 'demo' ? 'Demo data — not real' : 'Missing'}</dd>
            <dt>Source</dt>
            <dd>{m.source}</dd>
            <dt>Calculation</dt>
            <dd>{m.calculation}</dd>
            <dt>Period</dt>
            <dd>{m.period}</dd>
            {m.unit && (
              <>
                <dt>Unit</dt>
                <dd>{m.unit}</dd>
              </>
            )}
            <dt>Updated</dt>
            <dd>{m.lastUpdated ? (m.lastUpdated.length > 10 ? fmtDateTime(m.lastUpdated) : m.lastUpdated) : '—'}</dd>
            {m.note && (
              <>
                <dt>Note</dt>
                <dd>{m.note}</dd>
              </>
            )}
          </dl>
        </div>
      )}
    </span>
  );
}

export function StatTile({ m, color, icon, spark = false, compact = false, className = '', format }: { m: MetricValue; color: string; icon?: string; spark?: boolean; compact?: boolean; className?: string; format?: (v: number) => string }) {
  const missing = m.quality === 'missing';
  const shown = missing ? '—' : (m.display ?? (m.value != null ? (format ? format(m.value) : fmtNum(m.value)) : '—'));
  const showUnit = !missing && !m.display && m.value != null && m.unit && !['tasks', 'items'].includes(m.unit);
  const d = m.delta;
  return (
    <section className={`card stat${compact ? ' compact' : ''} ${className}`} aria-label={m.label}>
      <span className="accent-bar" style={{ background: color }} />
      <div className="label-row">
        {icon && <Icon name={icon} size={15} />}
        <span>{m.label}</span>
        <span style={{ marginLeft: 'auto' }}>
          <ProvenanceChip m={m} />
        </span>
      </div>
      <div className={`value${missing || m.value == null ? ' unknown' : ''}${!missing && m.display && m.display.length > 8 ? ' text' : ''}`}>
        {missing && <span className="sr-only">Unknown</span>}
        {shown}
        {showUnit && <span className="unit">{m.unit}</span>}
      </div>
      {spark && m.series && m.series.some((s) => s.value != null) && <Sparkline series={m.series} color={color} label={m.label} height={36} format={(v) => fmtNum(v, m.unit)} />}
      <div className="foot">
        {d && !missing && (
          <span className={`delta ${d.goodWhen === 'neutral' || d.value === 0 ? 'neutral' : (d.value > 0) === (d.goodWhen === 'up') ? 'good' : 'bad'}`}>
            {d.value > 0 ? '▲' : d.value < 0 ? '▼' : '•'} {fmtNum(Math.abs(d.value))} <span style={{ fontWeight: 450, color: 'var(--text-3)' }}>{d.period}</span>
          </span>
        )}
        {!d && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{missing ? shortReason(m.note) : (m.note ?? m.period)}</span>}
      </div>
    </section>
  );
}

function shortReason(note?: string): string {
  if (!note) return 'Unknown';
  if (/token|notion api|integration/i.test(note)) return 'Needs Notion API';
  if (/^no |not (tracked|found|readable)|awaiting|no .*(database|log|data)/i.test(note)) return 'Not tracked yet';
  return 'Unknown';
}

export function EmptyState({ title, children, icon = 'info', quote, action }: { title: string; children?: ReactNode; icon?: string; quote?: { text: string; cite: string; href?: string | null }; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="e-title">
        <Icon name={icon} size={16} />
        {title}
      </div>
      {children && <p>{children}</p>}
      {quote && (
        <blockquote>
          “{quote.text}”
          <cite>
            — {quote.href ? (
              <a href={quote.href} target="_blank" rel="noreferrer">
                {quote.cite} ↗
              </a>
            ) : (
              quote.cite
            )}
          </cite>
        </blockquote>
      )}
      {action}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function TaskRow({ t, today, tz, reason, rank, showArea = true, showStatus = true, compact = false }: { t: Task; today: string; tz: string; reason?: string; rank?: number; showArea?: boolean; showStatus?: boolean; compact?: boolean }) {
  const due = dueLabel(t, today, tz);
  const status = t.statusGroup ? STATUS_META[t.statusGroup] : null;
  const Title = t.url ? 'a' : 'span';
  return (
    <div className={`row${t.parentTitle ? ' child' : ''}`}>
      {rank != null && <span className="rank">{rank}</span>}
      <Title className="title" {...(t.url ? { href: t.url, target: '_blank', rel: 'noreferrer' } : {})} title={t.title}>
        {t.title}
        {compact ? (
          <small>{[due, areaLabel(t.area)].filter(Boolean).join(' · ')}</small>
        ) : (
          (reason || t.parentTitle) && <small>{reason ?? `in ${t.parentTitle}`}</small>
        )}
      </Title>
      <span className="meta">
        {showArea && !compact && <span className="tag">{areaLabel(t.area)}</span>}
        {due && !compact && <span className="pill num">{due}</span>}
        {showStatus && status && (
          <span className="pill">
            <span className="d" style={{ background: status.color }} />
            {t.status ?? status.label}
          </span>
        )}
      </span>
    </div>
  );
}

export function SectionTitle({ title, hint, right }: { title: string; hint?: string; right?: ReactNode }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {hint && <span className="hint">{hint}</span>}
      {right && <span style={{ marginLeft: 'auto' }}>{right}</span>}
    </div>
  );
}
