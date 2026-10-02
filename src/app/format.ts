import { addDays, dayKey, isDateOnly } from '../shared/dates';
import type { StatusGroup, Task } from '../shared/types';

export function fmtNum(v: number, unit?: string | null): string {
  const abs = Math.abs(v);
  const s = abs >= 10_000 ? `${(v / 1000).toFixed(abs >= 100_000 ? 0 : 1)}K` : Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 1 });
  return unit ? `${s} ${unit}` : s;
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(key: string): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/** "Oct 14" for a date or datetime string (calendar day as written in Notion). */
export function shortDay(value: string): string {
  return new Date(`${value.slice(0, 10)}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function dueLabel(t: Task, today: string, tz: string): string | null {
  if (!t.due) return null;
  const day = dayKey(t.due, tz);
  const time = !isDateOnly(t.due) ? new Date(t.due).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', timeZone: tz }) : '';
  let base: string;
  if (day === today) base = 'Today';
  else if (day === addDays(today, -1)) base = 'Yesterday';
  else if (day === addDays(today, 1)) base = 'Tomorrow';
  else base = new Date(`${day}T12:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return time ? `${base} ${time}` : base;
}

export const STATUS_META: Record<StatusGroup, { label: string; color: string }> = {
  todo: { label: 'To do', color: 'var(--text-3)' },
  in_progress: { label: 'In progress', color: 'var(--accent)' },
  waiting: { label: 'Waiting', color: 'var(--warn)' },
  blocked: { label: 'Blocked', color: 'var(--critical)' },
  done: { label: 'Done', color: 'var(--good)' },
};

export function greeting(now: Date): string {
  const h = now.getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export const DOMAIN_COLOR = {
  tasks: 'var(--c-tasks)',
  fitness: 'var(--c-fitness)',
  nutrition: 'var(--c-nutrition)',
  goals: 'var(--c-goals)',
  habits: 'var(--c-habits)',
  health: 'var(--c-health)',
} as const;
