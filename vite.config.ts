import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { localData } from './vite-plugins/localData';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };
let sha = process.env.GITHUB_SHA?.slice(0, 7) ?? '';
if (!sha) {
  try {
    sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    sha = 'local';
  }
}

export default defineConfig({
  // Relative base so the same build works at /, at /kp7/ on GitHub Pages, or any subpath.
  base: './',
  plugins: [react(), localData()],
  define: {
    __APP_VERSION__: JSON.stringify(`${pkg.version}+${sha}`),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
