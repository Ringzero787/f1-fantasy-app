// F-075 scroll budget: at 1440x900 and 390x844 no page may exceed three viewport heights, in any click-in state
// this script reaches, and nothing may overflow sideways. Run against the PREVIEW build (example data, no sign-in):
//   npm run build:preview && npm run test:scroll
// Playwright is not a dependency of this package; it is resolved from PLAYWRIGHT_PATH, NODE_PATH or the repo root.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const roots = [process.env.PLAYWRIGHT_PATH, ...(process.env.NODE_PATH ?? '').split(path.delimiter), path.join(here, '..', 'node_modules'), path.join(here, '..', '..', '..', 'node_modules')].filter(Boolean);
  for (const r of roots) { try { return require(path.join(r, 'playwright')); } catch { /* next */ } }
  throw new Error('playwright not found. Set PLAYWRIGHT_PATH or NODE_PATH to a node_modules folder that has it.');
}
const { chromium } = loadPlaywright();

// a free port every run: a fixed one collides with any preview server left running on the box
const PORT = await new Promise((resolve, reject) => { const srv = createServer(); srv.once('error', reject); srv.listen(0, () => { const { port } = srv.address(); srv.close(() => resolve(port)); }); });
// 127.0.0.1 on both sides: `localhost` can resolve to IPv6 for the browser and IPv4 for the server, which showed up as a rare refused connection
const BASE = `http://127.0.0.1:${PORT}`, LIMIT = 3.0;
const PAGES = [['BRIEFING', '/'], ['BOARD', '/board'], ['CIRCUIT', '/circuit'], ['PACE LAB', '/pace-lab'], ['MARKET', '/market'], ['LINEUP LAB', '/lineup-lab'], ['SEASON', '/season'], ['WIRE', '/wire']];
const SIZES = [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }];
const shots = path.join(here, 'out'); mkdirSync(shots, { recursive: true });

const server = spawn(process.execPath, [path.join(here, '..', 'node_modules', 'vite', 'bin', 'vite.js'), 'preview', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: path.join(here, '..'), stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* gone */ } };
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) { try { const r = await fetch(BASE); if (r.ok) return; } catch { /* not yet */ } await new Promise((r) => setTimeout(r, 250)); }
  throw new Error('preview server did not start');
}
const open = async (page, url) => { try { await page.goto(url, { waitUntil: 'networkidle' }); } catch (e) { console.error(`retrying ${url}: ${e.message.split('\n')[0]}`); await new Promise((r) => setTimeout(r, 1000)); await page.goto(url, { waitUntil: 'networkidle' }); } };
const measure = (page) => page.evaluate(() => ({ ratio: document.documentElement.scrollHeight / window.innerHeight, overflowX: document.documentElement.scrollWidth - window.innerWidth }));

const failures = [], rows = [];
process.on('unhandledRejection', (e) => { console.error(`scroll-budget crashed: ${e?.message ?? e}`); stop(); process.exit(2); });
await waitForServer();
const browser = await chromium.launch();
for (const size of SIZES) for (const scheme of ['dark', 'light']) {
  const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: scheme, hasTouch: size.name === 'phone', isMobile: size.name === 'phone' });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  for (const [name, route] of PAGES) {
    await open(page, BASE + route);
    await page.waitForSelector('.page');
    const states = [['default', async () => {}]];
    // every in-card tab and chip is a click-in state that must also fit
    // each control is tried from a fresh page, because one control can hide another (board presets only exist on one tab)
    const controls = await page.locator('main .tabs.sm button:visible, main .chip:visible').allTextContents();
    for (const text of controls) states.push([`control ${text}`, async () => { await open(page, BASE + route); await page.waitForSelector('.page'); await page.locator('main .tabs.sm button:visible, main .chip:visible').filter({ hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().click(); }]);
    if (name === 'LINEUP LAB') { states.push(['driver slot open', async () => { await open(page, BASE + route); await page.locator('.dt').first().click(); }]); states.push(['constructor slot open', async () => { await open(page, BASE + route); await page.locator('.dt.ctor').click(); }]); }
    for (const [label, act] of states) {
      await act(); await page.waitForTimeout(60);
      const m = await measure(page);
      rows.push(`${size.name.padEnd(7)} ${scheme.padEnd(5)} ${name.padEnd(10)} ${label.padEnd(22)} ${m.ratio.toFixed(2)}`);
      if (m.ratio > LIMIT) failures.push(`${size.name} ${scheme} ${name} [${label}]: ${m.ratio.toFixed(2)} screens (limit ${LIMIT})`);
      if (m.overflowX > 1) failures.push(`${size.name} ${scheme} ${name} [${label}]: overflows sideways by ${m.overflowX}px`);
    }
    if (scheme === 'dark') await page.screenshot({ path: path.join(shots, `${size.name}-${name.toLowerCase().replace(/ /g, '-')}.png`) });
  }
  // Every page again with only what the worker publishes today (`?bare=1`), so the "not published
  // yet" states are measured and proven to render without a page error, not just the example set.
  for (const [name, route] of PAGES) {
    await open(page, BASE + route + (route.includes('?') ? '&' : '?') + 'bare=1');
    await page.waitForSelector('.page');
    await page.waitForTimeout(60);
    const m = await measure(page);
    rows.push(`${size.name.padEnd(7)} ${scheme.padEnd(5)} ${name.padEnd(10)} ${'bare'.padEnd(22)} ${m.ratio.toFixed(2)}`);
    if (m.ratio > LIMIT) failures.push(`${size.name} ${scheme} ${name} [bare]: ${m.ratio.toFixed(2)} screens (limit ${LIMIT})`);
    if (m.overflowX > 1) failures.push(`${size.name} ${scheme} ${name} [bare]: overflows sideways by ${m.overflowX}px`);
  }

  // a free user's locked frames must fit too: the veil replaces nothing, so the height is the same,
  // but measure one page to be sure the offer itself does not overflow
  await open(page, BASE + '/market?lockedCheck=1');
  const locked = await measure(page);
  rows.push(`${size.name.padEnd(7)} ${scheme.padEnd(5)} ${'MARKET'.padEnd(10)} ${'locked view'.padEnd(22)} ${locked.ratio.toFixed(2)}`);
  if (locked.ratio > LIMIT) failures.push(`${size.name} ${scheme} MARKET [locked]: ${locked.ratio.toFixed(2)} screens`);

  // the slide-over opens, traps nothing behind it, and closes on Escape
  await open(page, BASE + '/board');
  await page.locator('main tbody tr').first().click();
  if (!(await page.locator('[role="dialog"]').isVisible())) failures.push(`${size.name} ${scheme}: slide-over did not open`);
  if (scheme === 'dark') await page.screenshot({ path: path.join(shots, `${size.name}-slide-over.png`) });
  await page.keyboard.press('Escape');
  if (await page.locator('[role="dialog"]').count()) failures.push(`${size.name} ${scheme}: slide-over did not close on Escape`);
  if (errors.length) failures.push(`${size.name} ${scheme}: page errors: ${errors.slice(0, 3).join(' | ')}`);
  await ctx.close();
}
await browser.close(); stop();

const worst = {};
for (const r of rows) { const [sz, , ...rest] = r.split(/\s+/); const ratio = Number(rest[rest.length - 1]); const name = r.slice(14, 25).trim(); const k = `${sz} ${name}`; worst[k] = Math.max(worst[k] ?? 0, ratio); }
console.log('Tallest state per page (screens):'); for (const [k, v] of Object.entries(worst)) console.log(`  ${k.padEnd(20)} ${v.toFixed(2)}`);
console.log(`${rows.length} states measured.`);
if (failures.length) { console.error(`\nFAILED (${failures.length}):`); for (const f of failures) console.error('  ' + f); process.exit(1); }
console.log('Scroll budget OK: every page and click-in state is within 3.0 screens with no sideways overflow.');
