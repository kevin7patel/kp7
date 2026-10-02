/**
 * Local mode for `npm run dev` / `npm run preview` on Kevin's machine:
 *   GET  /data/dashboard.json      ← .data/dashboard.json (plaintext, never leaves the machine)
 *   GET  /data/dashboard.enc.json  ← .data/publish/dashboard.enc.json
 *   POST /api/sync                 → runs the real pipeline (NOTION_TOKEN from env/.env)
 * KP7_MODE=encrypted|none simulates the hosted (encrypted) and disconnected states.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join } from 'node:path';
import type { Plugin } from 'vite';

type Next = (err?: unknown) => void;

function middleware(root: string) {
  const mode = process.env.KP7_MODE ?? 'plain';
  return (req: IncomingMessage, res: ServerResponse, next: Next) => {
    const url = (req.url ?? '').split('?')[0]!;
    const send = (file: string) => {
      if (!existsSync(file)) {
        res.statusCode = 404;
        res.setHeader('content-type', 'text/plain');
        res.end('not found');
        return;
      }
      res.setHeader('content-type', 'application/json');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(file));
    };
    if (url.endsWith('/data/dashboard.json')) return mode === 'plain' ? send(join(root, '.data', 'dashboard.json')) : send('/nonexistent');
    if (url.endsWith('/data/dashboard.enc.json')) return mode === 'none' ? send('/nonexistent') : send(join(root, '.data', 'publish', 'dashboard.enc.json'));
    if (url.endsWith('/api/sync') && req.method === 'POST') {
      const child = spawn(process.execPath, ['--import', 'tsx', 'src/pipeline/run.ts'], { cwd: root, env: process.env, stdio: 'inherit' });
      child.on('exit', () => {
        res.setHeader('content-type', 'application/json');
        const status = join(root, '.data', 'status.json');
        res.end(existsSync(status) ? readFileSync(status) : JSON.stringify({ ok: false, error: { message: 'No status written' } }));
      });
      return;
    }
    next();
  };
}

export function localData(): Plugin {
  return {
    name: 'kp7-local-data',
    configureServer(server) {
      server.middlewares.use(middleware(server.config.root));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware(server.config.root));
    },
  };
}
