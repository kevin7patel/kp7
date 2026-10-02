// Visual + behavioural verification against a running server (default: vite preview).
//   node scripts/screenshots.mjs [baseUrl] [--demo] [--routes=today,tasks] [--out=screenshots/x]
// Checks per page: console errors, horizontal overflow, and writes a screenshot.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const base = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:4173/';
const demo = args.includes('--demo');
const routes = (args.find((a) => a.startsWith('--routes='))?.split('=')[1] ?? 'today,tasks,progress,body/fitness,body/nutrition,body/health,goals,sources,settings').split(',');
const out = args.find((a) => a.startsWith('--out='))?.split('=')[1] ?? `screenshots/${demo ? 'demo' : 'real'}`;
const themes = (args.find((a) => a.startsWith('--themes='))?.split('=')[1] ?? 'light,dark').split(',');
const only = args.find((a) => a.startsWith('--viewports='))?.split('=')[1]?.split(',');
const key = args.find((a) => a.startsWith('--key='))?.split('=')[1];
mkdirSync(out, { recursive: true });

const viewports = [
  { name: 'macbook-14', width: 1512, height: 982, mobile: false },
  { name: 'macbook-13', width: 1280, height: 800, mobile: false },
  { name: 'ipad', width: 820, height: 1180, mobile: true },
  { name: 'iphone-15', width: 393, height: 852, mobile: true },
  { name: 'iphone-se', width: 375, height: 667, mobile: true },
].filter((v) => !only || only.includes(v.name));

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const problems = [];
for (const vp of viewports) {
  for (const theme of themes) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.mobile ? 2 : 1,
      isMobile: vp.mobile && vp.width < 800,
      hasTouch: vp.mobile,
      colorScheme: theme,
      timezoneId: 'America/Chicago',
      locale: 'en-US',
    });
    await ctx.addInitScript(
      ({ demo, key }) => {
        try {
          if (demo) localStorage.setItem('kp7.demo', '1');
          if (key) localStorage.setItem('kp7.dataKey', key);
        } catch {
          /* ignore */
        }
      },
      { demo, key },
    );
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    for (const r of routes) {
      await page.goto(`${base}#/${r}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 1) problems.push(`${vp.name}/${theme}/${r}: horizontal overflow ${overflow}px`);
      const file = `${out}/${vp.name}-${theme}-${r.replace('/', '-')}.png`;
      await page.screenshot({ path: file, fullPage: true });
      if (vp.mobile) await page.screenshot({ path: file.replace('.png', '-viewport.png') });
    }
    if (errors.length) problems.push(`${vp.name}/${theme}: console errors: ${[...new Set(errors)].slice(0, 5).join(' | ')}`);
    await ctx.close();
  }
}
await browser.close();
console.log(problems.length ? `PROBLEMS:\n${problems.join('\n')}` : `OK — ${viewports.length * themes.length * routes.length} screenshots in ${out}, no overflow, no console errors`);
process.exit(problems.length ? 1 : 0);
