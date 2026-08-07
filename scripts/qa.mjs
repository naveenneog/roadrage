import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Automated playtest.
 *
 * Loads the game, walks it through the menus into a race, plays for a while
 * with real key presses, and reports: console errors, page errors, failed
 * requests, measured frame rate, horizontal overflow per viewport, and whether
 * the simulation actually progressed. Writes screenshots for eyeballing.
 *
 * Usage: node scripts/qa.mjs [url] [--out qa] [--seconds 12]
 */
const args = process.argv.slice(2);
const url = args.find((a) => !a.startsWith('--')) ?? 'http://localhost:5180/';
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const outDir = flag('out', 'qa');
const playSeconds = Number(flag('seconds', '12'));

const VIEWPORTS = [
  { name: 'desktop-1920', width: 1920, height: 1080, mobile: false },
  { name: 'laptop-1440', width: 1440, height: 900, mobile: false },
  { name: 'phone-landscape', width: 844, height: 390, mobile: true },
  { name: 'tablet-landscape', width: 1180, height: 820, mobile: true },
];

mkdirSync(outDir, { recursive: true });

const report = { url, viewports: [], errors: [], summary: {} };
let failed = false;

const browser = await chromium.launch();

for (const viewport of VIEWPORTS) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.mobile ? 2 : 1,
    hasTouch: viewport.mobile,
    isMobile: viewport.mobile,
    reducedMotion: 'no-preference',
  });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    // Vite's HMR socket is expected to be absent in some runs.
    if (req.url().includes('__vite') || req.url().startsWith('ws')) return;
    failedRequests.push(`${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
  });

  const entry = { name: viewport.name, size: `${viewport.width}x${viewport.height}` };

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
    await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 15_000 });

    // Title screen.
    await page.waitForSelector('#screen-title', { timeout: 10_000 });
    await page.screenshot({ path: join(outDir, `${viewport.name}-01-title.png`) });

    // Into the circuit list.
    await page.click('#screen-title .menu button.primary');
    await page.waitForSelector('#screen-circuits', { timeout: 5000 });
    await page.screenshot({ path: join(outDir, `${viewport.name}-02-circuits.png`) });

    // Start the first (always unlocked) circuit.
    await page.click('#screen-circuits .card-list button.card:not([disabled])');
    await page.waitForFunction(() => window.__game.state().phase !== null, null, { timeout: 8000 });

    // Let the countdown run, then hold the throttle and fight for a while.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(outDir, `${viewport.name}-03-countdown.png`) });

    await page.keyboard.down('ArrowUp');
    const start = Date.now();
    let steer = null;
    while ((Date.now() - start) / 1000 < playSeconds) {
      const t = (Date.now() - start) / 1000;
      const wantSteer = Math.sin(t * 0.8) > 0 ? 'ArrowRight' : 'ArrowLeft';
      if (steer !== wantSteer) {
        if (steer) await page.keyboard.up(steer);
        await page.keyboard.down(wantSteer);
        steer = wantSteer;
      }
      if (Math.floor(t * 2) % 5 === 0) await page.keyboard.press('KeyK');
      await page.waitForTimeout(180);
    }
    if (steer) await page.keyboard.up(steer);

    const midState = await page.evaluate(() => window.__game.state());
    await page.screenshot({ path: join(outDir, `${viewport.name}-04-racing.png`) });

    // Measure frame rate over a two-second window while the game is busy.
    const fps = await page.evaluate(
      () =>
        new Promise((resolve) => {
          let frames = 0;
          const begin = performance.now();
          const tick = () => {
            frames++;
            if (performance.now() - begin >= 2000) resolve(Math.round((frames * 1000) / (performance.now() - begin)));
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }),
    );
    await page.keyboard.up('ArrowUp');

    // Pause menu reachable and rendering.
    await page.keyboard.press('Escape');
    await page.waitForSelector('#screen-paused', { timeout: 4000 });
    await page.screenshot({ path: join(outDir, `${viewport.name}-05-paused.png`) });

    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));

    entry.fps = fps;
    entry.state = midState;
    entry.overflow = overflow.scrollWidth > overflow.clientWidth + 1
      ? `${overflow.scrollWidth} > ${overflow.clientWidth}`
      : null;
    entry.moved = midState.speed > 0;
    entry.spritesBuilt = midState.sprites;

    if (!entry.moved) {
      failed = true;
      report.errors.push(`${viewport.name}: the bike never moved (speed stayed at 0)`);
    }
    if (fps < 30) {
      failed = true;
      report.errors.push(`${viewport.name}: ${fps} fps is below the 30 fps floor`);
    }
    if (entry.overflow) {
      failed = true;
      report.errors.push(`${viewport.name}: horizontal overflow ${entry.overflow}`);
    }
  } catch (error) {
    failed = true;
    entry.fatal = String(error).split('\n')[0];
    report.errors.push(`${viewport.name}: ${entry.fatal}`);
    await page.screenshot({ path: join(outDir, `${viewport.name}-FATAL.png`) }).catch(() => {});
  }

  entry.consoleErrors = consoleErrors;
  entry.pageErrors = pageErrors;
  entry.failedRequests = failedRequests;
  if (consoleErrors.length || pageErrors.length || failedRequests.length) {
    failed = true;
    for (const e of [...consoleErrors, ...pageErrors, ...failedRequests]) {
      report.errors.push(`${viewport.name}: ${e}`);
    }
  }

  report.viewports.push(entry);
  await context.close();
}

await browser.close();

report.summary = {
  passed: !failed,
  viewports: report.viewports.length,
  errorCount: report.errors.length,
  fps: Object.fromEntries(report.viewports.map((v) => [v.name, v.fps ?? null])),
};

writeFileSync(join(outDir, 'report.json'), JSON.stringify(report, null, 2));

console.log('\n─── QA report ───');
for (const v of report.viewports) {
  const status = v.fatal ? 'FATAL' : 'ok';
  console.log(
    `${v.name.padEnd(18)} ${String(v.size).padEnd(10)} ${String(status).padEnd(6)}`,
    `fps=${String(v.fps ?? '-').padStart(4)}`,
    `moved=${v.moved ?? '-'}`,
    `sprites=${v.spritesBuilt ?? '-'}`,
    `overflow=${v.overflow ?? 'none'}`,
    `errors=${(v.consoleErrors?.length ?? 0) + (v.pageErrors?.length ?? 0)}`,
  );
}
if (report.errors.length) {
  console.log('\nProblems:');
  for (const e of report.errors) console.log(`  - ${e}`);
}
console.log(`\n${failed ? 'FAILED' : 'PASSED'} — screenshots and report in ./${outDir}\n`);
process.exit(failed ? 1 : 0);
