/**
 * Dashboard API/state: loads the latest payload (plain in local mode, encrypted on
 * static hosting), refreshes on focus / interval / reconnect, exposes "Sync now",
 * and derives an honest freshness state. It never writes to Notion.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { dashboardConfig } from '../../../config/dashboard.config';
import { DecryptError, decryptJson, isPlausibleKey } from '../../shared/crypto';
import { deviceTimezone, minutesSince } from '../../shared/dates';
import type { DashboardPayload, EncryptedEnvelope } from '../../shared/types';
import { demoPayload } from '../../metrics/demo';
import { dispatchSync, latestRun, waitForRun, type RunInfo } from './github';
import { KEYS, store } from './storage';

export type LoadStatus = 'loading' | 'ready' | 'locked' | 'badkey' | 'disconnected';

export interface DashState {
  status: LoadStatus;
  payload: DashboardPayload | null;
  mode: 'plain' | 'encrypted' | 'demo' | null;
  fetchedAt: number | null;
  offline: boolean;
  lastRun: RunInfo | null;
  syncing: boolean;
  message: { kind: 'info' | 'error'; text: string } | null;
}

const DATA_BASE = 'data/';

async function fetchJson<T>(path: string): Promise<{ ok: true; data: T; fromCache: boolean } | { ok: false; status: number }> {
  const res = await fetch(`${DATA_BASE}${path}?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return { ok: false, status: res.status };
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('json')) return { ok: false, status: 415 };
  // The service worker sets this header when it answers from cache because the network failed.
  const fromCache = res.headers.get('x-kp7-from-cache') === '1' || (typeof navigator !== 'undefined' && navigator.onLine === false);
  return { ok: true, data: (await res.json()) as T, fromCache };
}

export function useDashboard() {
  const [state, setState] = useState<DashState>({ status: 'loading', payload: null, mode: null, fetchedAt: null, offline: false, lastRun: null, syncing: false, message: null });
  const [demo, setDemoState] = useState(() => store.get(KEYS.demo) === '1' || new URLSearchParams(location.search).has('demo'));
  const fetchedAtRef = useRef<number | null>(null);

  const load = useCallback(
    async (opts: { silent?: boolean } = {}) => {
      if (demo) {
        setState((s) => ({ ...s, status: 'ready', payload: demoPayload(new Date(), deviceTimezone()), mode: 'demo', fetchedAt: Date.now(), offline: false }));
        fetchedAtRef.current = Date.now();
        return;
      }
      if (!opts.silent) setState((s) => ({ ...s, status: s.payload ? s.status : 'loading' }));
      try {
        // 1) Local / private hosting: plaintext payload.
        const plain = await fetchJson<DashboardPayload>('dashboard.json');
        if (plain.ok) {
          fetchedAtRef.current = Date.now();
          setState((s) => ({ ...s, status: 'ready', payload: plain.data, mode: 'plain', fetchedAt: Date.now(), offline: plain.fromCache }));
          return;
        }
        // 2) Public static hosting: encrypted payload.
        const enc = await fetchJson<EncryptedEnvelope>('dashboard.enc.json');
        if (!enc.ok) {
          setState((s) => ({ ...s, status: 'disconnected', payload: null, mode: null }));
          return;
        }
        const key = store.get(KEYS.dataKey);
        if (!key) {
          setState((s) => ({ ...s, status: 'locked', payload: null, mode: 'encrypted' }));
          return;
        }
        const payload = await decryptJson<DashboardPayload>(enc.data, key);
        fetchedAtRef.current = Date.now();
        setState((s) => ({ ...s, status: 'ready', payload, mode: 'encrypted', fetchedAt: Date.now(), offline: enc.fromCache }));
        latestRun(store.get(KEYS.ghToken))
          .then((lastRun) => setState((s) => ({ ...s, lastRun })))
          .catch(() => undefined);
      } catch (err) {
        if (err instanceof DecryptError) {
          setState((s) => ({ ...s, status: 'badkey', payload: null }));
          return;
        }
        // Network failure: keep whatever we have and say so.
        setState((s) => ({ ...s, status: s.payload ? 'ready' : 'disconnected', offline: true }));
      }
    },
    [demo],
  );

  useEffect(() => {
    void load();
  }, [load]);

  // Refresh when the app is revisited, periodically while open, and on reconnect.
  useEffect(() => {
    const stale = () => fetchedAtRef.current === null || Date.now() - fetchedAtRef.current > dashboardConfig.refresh.onFocusAfterMinutes * 60_000;
    const onVisible = () => document.visibilityState === 'visible' && stale() && void load({ silent: true });
    const onOnline = () => void load({ silent: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const timer = window.setInterval(() => document.visibilityState === 'visible' && void load({ silent: true }), dashboardConfig.refresh.whileOpenEveryMinutes * 60_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      window.clearInterval(timer);
    };
  }, [load]);

  const syncNow = useCallback(async () => {
    setState((s) => ({ ...s, syncing: true, message: null }));
    try {
      if (demo) {
        await load();
        setState((s) => ({ ...s, message: { kind: 'info', text: 'Demo data regenerated.' } }));
      } else if (import.meta.env.DEV) {
        // Local mode: run the real pipeline on this machine (vite dev middleware).
        const res = await fetch('api/sync', { method: 'POST' });
        const status = (await res.json()) as { ok: boolean; error?: { message: string } | null };
        await load({ silent: true });
        setState((s) => ({ ...s, message: status.ok ? { kind: 'info', text: 'Synced from Notion just now.' } : { kind: 'error', text: `Sync failed: ${status.error?.message ?? 'unknown error'}` } }));
      } else {
        const token = store.get(KEYS.ghToken);
        if (token) {
          const started = Date.now();
          await dispatchSync(token);
          setState((s) => ({ ...s, message: { kind: 'info', text: 'Notion sync started on GitHub Actions…' } }));
          const run = await waitForRun(token, started, (lastRun) => lastRun && setState((s) => ({ ...s, lastRun })));
          await load({ silent: true });
          setState((s) => ({
            ...s,
            lastRun: run ?? s.lastRun,
            message: run?.conclusion === 'success' ? { kind: 'info', text: 'Synced from Notion just now.' } : { kind: 'error', text: run ? `Sync run ${run.conclusion}. See GitHub Actions for details.` : 'Sync is still running — data will refresh automatically.' },
          }));
        } else {
          await load({ silent: true });
          setState((s) => ({ ...s, message: { kind: 'info', text: 'Refreshed the latest published data. Notion is synced every 30 minutes; add a GitHub token in Settings to trigger a sync on demand.' } }));
        }
      }
    } catch (err) {
      setState((s) => ({ ...s, message: { kind: 'error', text: (err as Error).message } }));
    } finally {
      setState((s) => ({ ...s, syncing: false }));
    }
  }, [demo, load]);

  const setKey = useCallback(
    (key: string | null) => {
      if (key && !isPlausibleKey(key)) throw new Error('That does not look like a dashboard key (32-byte base64url).');
      store.set(KEYS.dataKey, key);
      void load();
    },
    [load],
  );

  const setDemo = useCallback((on: boolean) => {
    store.set(KEYS.demo, on ? '1' : null);
    setDemoState(on);
  }, []);

  const dismissMessage = useCallback(() => setState((s) => ({ ...s, message: null })), []);

  return { state, demo, setDemo, load, syncNow, setKey, dismissMessage };
}

export type SyncKind = 'live' | 'snapshot' | 'stale' | 'error' | 'offline' | 'locked' | 'demo' | 'syncing' | 'loading';

export interface SyncView {
  kind: SyncKind;
  label: string;
  lastSynced: string | null;
  detail: string;
}

/** Honest freshness: "last synced" is when Notion was actually read, never when the page loaded. */
export function syncView(s: DashState, now: Date): SyncView {
  if (s.syncing) return { kind: 'syncing', label: 'Syncing…', lastSynced: null, detail: 'Sync in progress' };
  if (s.status === 'loading') return { kind: 'loading', label: 'Loading…', lastSynced: null, detail: '' };
  if (s.status === 'locked' || s.status === 'badkey') return { kind: 'locked', label: 'Locked', lastSynced: null, detail: 'Enter your dashboard key to unlock data.' };
  if (!s.payload) return { kind: 'error', label: 'Not connected', lastSynced: null, detail: 'No published data was found.' };
  if (s.mode === 'demo') return { kind: 'demo', label: 'Demo data', lastSynced: null, detail: 'Synthetic data for previewing visuals.' };

  const p = s.payload;
  let last = p.source.capturedAt;
  const run = s.lastRun;
  if (p.source.kind === 'notion-api' && run?.conclusion === 'success' && Date.parse(run.updatedAt) > Date.parse(last)) last = run.updatedAt;
  const age = minutesSince(last, now);
  const failed = p.source.kind === 'notion-api' && run?.status === 'completed' && run.conclusion === 'failure' && Date.parse(run.updatedAt) > Date.parse(p.source.capturedAt);

  if (failed) return { kind: 'error', label: 'Sync failing', lastSynced: last, detail: 'The latest scheduled Notion sync failed; showing the last good data.' };
  if (s.offline) return { kind: 'offline', label: 'Offline', lastSynced: last, detail: 'Could not reach the server; showing cached data.' };
  if (p.source.kind === 'notion-mcp-snapshot') return { kind: age > dashboardConfig.freshness.staleAfterMinutes ? 'stale' : 'snapshot', label: 'Snapshot', lastSynced: last, detail: p.source.coverage === 'metadata-only' ? 'Titles-only snapshot captured through the Notion connector. Live sync starts once the Notion token is configured.' : 'Point-in-time Notion values captured through the Notion connector, not a live sync. Live sync starts once the Notion token is configured.' };
  if (age > dashboardConfig.freshness.staleAfterMinutes) return { kind: 'stale', label: 'Stale', lastSynced: last, detail: `No successful sync in ${Math.round(age / 60)}h. It is scheduled every 30 min, but GitHub can run scheduled jobs hours late.` };
  return { kind: 'live', label: 'Synced', lastSynced: last, detail: 'Synced from Notion.' };
}
