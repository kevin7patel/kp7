/**
 * Talks to the public GitHub Actions API for the scheduled sync:
 * - read the latest run (unauthenticated; public repo) → "last synced" / errors
 * - optionally dispatch an immediate run with a fine-grained token Kevin stores locally
 */
import { dashboardConfig } from '../../../config/dashboard.config';

const { owner, repo, syncWorkflow, ref } = dashboardConfig.github;
const API = `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${syncWorkflow}`;

export interface RunInfo {
  id: number;
  status: 'queued' | 'in_progress' | 'completed' | string;
  conclusion: 'success' | 'failure' | 'cancelled' | null | string;
  updatedAt: string;
  createdAt: string;
  url: string;
  event: string;
}

/**
 * The latest *finished* sync that says something about freshness. Queued, running, cancelled
 * and skipped runs are ignored, so a superseded run never hides the last real success or failure.
 */
export async function latestRun(token?: string | null): Promise<RunInfo | null> {
  const res = await fetch(`${API}/runs?per_page=10&branch=${ref}&status=completed`, {
    headers: { Accept: 'application/vnd.github+json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { workflow_runs?: { id: number; status: string; conclusion: string | null; updated_at: string; created_at: string; html_url: string; event: string }[] };
  const r = body.workflow_runs?.find((x) => x.status === 'completed' && x.conclusion !== 'cancelled' && x.conclusion !== 'skipped');
  return r ? { id: r.id, status: r.status, conclusion: r.conclusion, updatedAt: r.updated_at, createdAt: r.created_at, url: r.html_url, event: r.event } : null;
}

export async function dispatchSync(token: string): Promise<void> {
  const res = await fetch(`${API}/dispatches`, {
    method: 'POST',
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ref }),
  });
  if (res.status !== 204) throw new Error(res.status === 401 || res.status === 403 ? 'GitHub token was rejected (needs Actions: read & write on kp7)' : `GitHub returned ${res.status}`);
}

/** Wait for a run created after `since` to finish (max ~4 minutes). */
export async function waitForRun(token: string, since: number, onTick?: (r: RunInfo | null) => void): Promise<RunInfo | null> {
  const deadline = Date.now() + 4 * 60_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 5000));
    const run = await latestRun(token).catch(() => null);
    onTick?.(run);
    if (run && Date.parse(run.createdAt) >= since - 5000 && run.status === 'completed') return run;
  }
  return null;
}
