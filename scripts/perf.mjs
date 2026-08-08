import { chromium } from 'playwright';

/**
 * Frame-time breakdown.
 *
 * Reports how many milliseconds go to simulation versus drawing, so tuning the
 * renderer is measurement rather than guesswork.
 *
 * Usage: node scripts/perf.mjs [url] [--seconds 8]
 */
const url = process.argv.find((a) => a.startsWith('http')) ?? 'http://localhost:5180/';
const i = process.argv.indexOf('--seconds');
const seconds = i >= 0 ? Number(process.argv[i + 1]) : 8;

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await context.newPage();

await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 15_000 });
await page.waitForSelector('#screen-title', { timeout: 10_000 });
await page.click('#screen-title .menu button.primary');
await page.waitForSelector('#screen-circuits', { timeout: 5000 });
await page.click('#screen-circuits .card-list button.card:not([disabled])');
await page.waitForFunction(() => window.__game.state().phase !== null, null, { timeout: 10_000 });
await page.waitForTimeout(1600);

await page.keyboard.down('ArrowUp');
const samples = [];
const start = Date.now();
while ((Date.now() - start) / 1000 < seconds) {
  const s = await page.evaluate(() => window.__game.state());
  if (s.speed > 500) samples.push(s);
  await page.waitForTimeout(200);
}
await page.keyboard.up('ArrowUp');

const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0;
  const begin = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - begin >= 2500) resolve(Math.round((frames * 1000) / (performance.now() - begin)));
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}));

await browser.close();

const avg = (key) => samples.reduce((a, s) => a + s[key], 0) / Math.max(1, samples.length);
const p95 = (key) => {
  const sorted = samples.map((s) => s[key]).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.95)] ?? 0;
};

console.log('\n─── frame budget at 1920x1080 ───');
console.log(`  samples   ${samples.length}`);
console.log(`  sim       ${avg('simMs').toFixed(2)} ms  (p95 ${p95('simMs').toFixed(2)})`);
console.log(`  draw      ${avg('drawMs').toFixed(2)} ms  (p95 ${p95('drawMs').toFixed(2)})`);
console.log(`  total     ${(avg('simMs') + avg('drawMs')).toFixed(2)} ms  → budget is 16.7 ms for 60 fps`);
console.log(`  measured  ${fps} fps`);
console.log('');
