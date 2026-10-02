// Renders public/icons/icon.svg to the PNG sizes the PWA manifest and iOS need.
// Uses the preinstalled Chromium via playwright-core (no downloads).
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const svg = readFileSync(new URL('../public/icons/icon.svg', import.meta.url), 'utf8');
const executablePath = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({ executablePath });
const page = await browser.newPage();

const targets = [
  { file: 'icon-192.png', size: 192, pad: 0 },
  { file: 'icon-512.png', size: 512, pad: 0 },
  { file: 'apple-touch-icon.png', size: 180, pad: 0, square: true },
  { file: 'maskable-512.png', size: 512, pad: 0.12, square: true },
];

for (const t of targets) {
  await page.setViewportSize({ width: t.size, height: t.size });
  const inner = Math.round(t.size * (1 - t.pad * 2));
  // Maskable/apple icons need a full-bleed square background (the OS applies its own mask).
  const body = `<html><body style="margin:0;background:${t.square ? '#0a0b0c' : 'transparent'};display:grid;place-items:center;width:${t.size}px;height:${t.size}px">
    <div style="width:${inner}px;height:${inner}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `).replace(t.square ? 'rx="112"' : '__', t.square ? 'rx="0"' : '__')}</div></body></html>`;
  await page.setContent(body);
  await page.screenshot({ path: new URL(`../public/icons/${t.file}`, import.meta.url).pathname, omitBackground: !t.square });
  console.log('wrote', t.file);
}
await browser.close();
