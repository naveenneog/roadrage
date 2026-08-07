import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Focused playtest of the Auto Rickshaw Edition.
 *
 * Walks title → Night Fare → chapter one → the story card → into the race, then
 * drives the auto for a while and checks it actually moves, the story beats
 * fire, and nothing errors.
 *
 * Usage: node scripts/qa-campaign.mjs [url]
 */
const url = process.argv[2] ?? 'http://localhost:5180/';
const outDir = 'qa';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

let failed = false;
const check = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failed = true;
};

try {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 15_000 });
  await page.waitForSelector('#screen-title', { timeout: 10_000 });

  // Title → campaign list.
  await page.click('#screen-title .menu button:nth-child(2)');
  await page.waitForSelector('#screen-campaign', { timeout: 5000 });
  await page.screenshot({ path: join(outDir, 'campaign-01-chapters.png') });

  const cards = await page.$$('#screen-campaign .card-list button.card');
  check('six chapters are listed', cards.length === 6, `${cards.length} found`);

  const locked = await page.$$('#screen-campaign .card-list button.card[disabled]');
  check('only chapter one is unlocked at the start', locked.length === 5, `${locked.length} locked`);

  // Chapter one → story card.
  await page.click('#screen-campaign .card-list button.card:not([disabled])');
  await page.waitForSelector('#screen-story', { timeout: 5000 });
  await page.screenshot({ path: join(outDir, 'campaign-02-story.png') });

  const storyText = await page.textContent('#screen-story');
  check('the story card carries the opening narration',
    (storyText ?? '').includes('Shivajinagar') || (storyText ?? '').includes('meter'),
    `${(storyText ?? '').length} chars`);

  // Into the race.
  await page.click('#screen-story button.primary');
  await page.waitForFunction(() => window.__game.state().phase !== null, null, { timeout: 10_000 });
  await page.waitForTimeout(1400);

  const started = await page.evaluate(() => window.__game.state());
  check('the race is running on a campaign circuit', started.phase !== null, JSON.stringify(started.phase));
  check('the atlas warmed the auto rickshaw sprites', started.sprites > 40, `${started.sprites} sprites`);

  // Drive for a while.
  await page.keyboard.down('ArrowUp');
  for (let i = 0; i < 40; i++) {
    if (i % 8 === 0) await page.keyboard.press('KeyK');
    await page.waitForTimeout(200);
  }
  await page.screenshot({ path: join(outDir, 'campaign-03-driving.png') });
  const mid = await page.evaluate(() => window.__game.state());
  await page.keyboard.up('ArrowUp');

  check('the auto actually moves', mid.speed > 100, `speed=${Math.round(mid.speed)}`);
  // 65 km/h in simulation units is about 4,333 — it must not be racing a superbike.
  check('the auto is slow, as a 10 bhp three-wheeler should be',
    mid.speed < 5200, `speed=${Math.round(mid.speed)} units`);

  const fps = await page.evaluate(() => new Promise((resolve) => {
    let frames = 0;
    const begin = performance.now();
    const tick = () => {
      frames++;
      if (performance.now() - begin >= 2000) resolve(Math.round((frames * 1000) / (performance.now() - begin)));
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  check('holds frame rate during the chase', fps >= 50, `${fps} fps`);

  // Pause and quit cleanly — the lifecycle path most likely to leak.
  await page.keyboard.press('Escape');
  await page.waitForSelector('#screen-paused', { timeout: 4000 });
  await page.click('#screen-paused button.ghost');
  await page.waitForSelector('#screen-title', { timeout: 5000 });
  check('quitting to the menu works', true);

  // Re-enter to confirm nothing was left in a broken state.
  await page.click('#screen-title .menu button:nth-child(2)');
  await page.waitForSelector('#screen-campaign', { timeout: 5000 });
  await page.click('#screen-campaign .card-list button.card:not([disabled])');
  await page.waitForSelector('#screen-story', { timeout: 5000 });
  await page.click('#screen-story button.primary');
  await page.waitForTimeout(1600);
  const second = await page.evaluate(() => window.__game.state());
  check('a second run starts cleanly', second.phase !== null, JSON.stringify(second.phase));

  check('no console or page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) {
  failed = true;
  console.log(`  FATAL  ${String(error).split('\n')[0]}`);
  await page.screenshot({ path: join(outDir, 'campaign-FATAL.png') }).catch(() => {});
}

await browser.close();
console.log(`\n${failed ? 'FAILED' : 'PASSED'} — Auto Rickshaw Edition\n`);
process.exit(failed ? 1 : 0);
