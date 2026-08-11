import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Visual smoke test across circuits.
 *
 * Unlocks everything, then drops into each circuit in turn and captures a frame
 * a few seconds into the race. The point is to catch circuit-specific rendering
 * faults — fog so thick the road vanishes, a night palette that is simply black,
 * a scenery mix that covers the tarmac — which a single-circuit run cannot.
 *
 * Usage: node scripts/qa-circuits.mjs [url]
 */
const url = process.argv[2] ?? 'http://localhost:5180/';
const outDir = 'qa-circuits';
mkdirSync(outDir, { recursive: true });

/** Career order — the QA script clicks cards by index, so this must match it. */
const CIRCUITS = [
  'shivajinagar', 'talao-pali', 'sb-road', 'goa-nh66',
  'ghodbunder', 'marine-drive', 'yeoor', 'malshej', 'chandni-chowk',
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const page = await context.newPage();

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });

// Unlock the whole ladder and buy the fast bike so every circuit is reachable.
await page.evaluate((ids) => {
  localStorage.setItem('roadrage/save/v1', JSON.stringify({
    version: 1,
    cash: 5_000_000,
    ownedBikes: ['splendor', 'rx100', 'pulsar220', 'ns200', 'duke390', 'interceptor'],
    currentBike: 'ns200',
    unlockedCircuits: ids,
    careerLevel: 9,
    storyChapter: 5,
    bestTimes: {},
    wins: 0, races: 0, takedowns: 0,
    settings: {
      masterVolume: 0, musicVolume: 0, sfxVolume: 0,
      tiltSteering: false, reducedMotion: false, quality: 'high', showFps: false,
    },
  }));
}, CIRCUITS);

let failed = false;

for (const id of CIRCUITS) {
  await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
  await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 15_000 });
  await page.waitForSelector('#screen-title', { timeout: 10_000 });
  await page.click('#screen-title .menu button.primary');
  await page.waitForSelector('#screen-circuits', { timeout: 5000 });

  // Find the card for this circuit by its position in the career order.
  const index = CIRCUITS.indexOf(id);
  const cards = await page.$$('#screen-circuits .card-list button.card');
  const card = cards[index];
  if (!card) {
    console.log(`  FAIL  ${id}: no card at index ${index}`);
    failed = true;
    continue;
  }
  await card.click();

  await page.waitForFunction(() => window.__game.state().phase !== null, null, { timeout: 10_000 });
  // Past the countdown, then a few seconds of driving so scenery is in shot.
  await page.waitForTimeout(1400);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(4200);
  const state = await page.evaluate(() => window.__game.state());
  await page.screenshot({ path: join(outDir, `${index + 1}-${id}.png`) });
  await page.keyboard.up('ArrowUp');

  // Sample the middle of the frame: if the road is invisible the picture will be
  // almost uniform, which is the failure this test exists to catch.
  const spread = await page.evaluate(() => {
    const canvas = document.getElementById('stage');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(Math.floor(w * 0.25), Math.floor(h * 0.55),
      Math.floor(w * 0.5), Math.floor(h * 0.4)).data;
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 16) {
      const l = (data[i] + data[i + 1] + data[i + 2]) / 3;
      if (l < min) min = l;
      if (l > max) max = l;
    }
    return { min, max, range: max - min };
  });

  const ok = state.speed > 100 && spread.range > 25;
  if (!ok) failed = true;
  console.log(
    `  ${ok ? 'ok  ' : 'FAIL'}  ${id.padEnd(16)}`,
    `speed=${String(Math.round(state.speed)).padStart(5)}`,
    `sprites=${String(state.sprites).padStart(3)}`,
    `contrast=${String(Math.round(spread.range)).padStart(3)}`,
    `(lum ${Math.round(spread.min)}–${Math.round(spread.max)})`,
  );
}

await browser.close();
if (errors.length) {
  failed = true;
  console.log('\nErrors:');
  for (const e of errors.slice(0, 6)) console.log(`  - ${e}`);
}
console.log(`\n${failed ? 'FAILED' : 'PASSED'} — screenshots in ./${outDir}\n`);
process.exit(failed ? 1 : 0);
