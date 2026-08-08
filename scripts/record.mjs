import { chromium } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, renameSync, rmSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Records a gameplay snippet.
 *
 * Playwright's recorder is capped at 25 fps with no way to raise it, so the
 * game is run at half speed, recorded for twice as long, and then sped back up
 * with ffmpeg — which lands an effective 50 fps. The simulation is slowed via
 * the debug time-scale hook, so physics, AI and audio all stay in step; only
 * wall-clock time is stretched.
 *
 * Usage:
 *   node scripts/record.mjs [url] --seconds 30 --circuit 1 --out media
 *   node scripts/record.mjs --campaign        # record the Auto Rickshaw Edition
 */
const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const has = (name) => args.includes(`--${name}`);

const url = args.find((a) => a.startsWith('http')) ?? 'http://localhost:5180/';
const seconds = Number(flag('seconds', '30'));
const circuitIndex = Number(flag('circuit', '0'));
const outDir = resolve(flag('out', 'media'));
const campaign = has('campaign');
const SLOW = 0.5;
const width = Number(flag('width', '1600'));
const height = Number(flag('height', '900'));

const wallClock = seconds / SLOW;
mkdirSync(outDir, { recursive: true });
const tmpDir = join(outDir, '.raw');
rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });

console.log(`Recording ${seconds}s of gameplay at ~50 fps`);
console.log(`  url        ${url}`);
console.log(`  viewport   ${width}x${height}`);
console.log(`  mode       ${campaign ? 'Auto Rickshaw Edition' : `circuit #${circuitIndex + 1}`}`);
console.log(`  wall clock ${wallClock}s at ${SLOW}x, sped up ${1 / SLOW}x on encode`);

const browser = await chromium.launch({
  headless: true,
  args: ['--autoplay-policy=no-user-gesture-required', '--disable-lcd-text'],
});
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 1,
  recordVideo: { dir: tmpDir, size: { width, height } },
});
const page = await context.newPage();

const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 15_000 });

// Unlock the career so any circuit is reachable, and pick a quick machine.
await page.evaluate(() => {
  localStorage.setItem('roadrash-bharat/save/v1', JSON.stringify({
    version: 1,
    cash: 5_000_000,
    ownedBikes: ['splendor', 'rx100', 'classic350', 'pulsar220', 'ns200', 'rd350', 'duke390', 'interceptor'],
    currentBike: 'ns200',
    unlockedCircuits: ['shivajinagar', 'talao-pali', 'sb-road', 'goa-nh66', 'ghodbunder',
      'marine-drive', 'yeoor', 'malshej', 'chandni-chowk'],
    careerLevel: 9, storyChapter: 5, bestTimes: {}, wins: 0, races: 0, takedowns: 0,
    settings: {
      masterVolume: 0.85, musicVolume: 0.55, sfxVolume: 0.95,
      tiltSteering: false, reducedMotion: false, quality: 'high', showFps: false,
    },
  }));
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => Boolean(window.__game), null, { timeout: 15_000 });
await page.waitForSelector('#screen-title', { timeout: 10_000 });

// Navigate into a race.
if (campaign) {
  await page.click('#screen-title .menu button:nth-child(2)');
  await page.waitForSelector('#screen-campaign', { timeout: 5000 });
  await page.click('#screen-campaign .card-list button.card:not([disabled])');
  await page.waitForSelector('#screen-story', { timeout: 5000 });
  await page.click('#screen-story button.primary');
} else {
  await page.click('#screen-title .menu button.primary');
  await page.waitForSelector('#screen-circuits', { timeout: 5000 });
  const cards = await page.$$('#screen-circuits .card-list button.card:not([disabled])');
  const card = cards[Math.min(circuitIndex, cards.length - 1)];
  if (!card) throw new Error('no selectable circuit card');
  await card.click();
}

await page.waitForFunction(() => window.__game.state().phase !== null, null, { timeout: 12_000 });

// Survive the whole clip, and slow the world for the capture.
await page.evaluate((slow) => {
  window.__game.invincible(true);
  window.__game.timeScale(slow);
}, SLOW);

/**
 * A rider, not a robot. Holds a racing line, weaves within the lane, throws
 * hands at whoever is alongside, and boosts down the straights. Reading the
 * live lateral position matters: a bot that saws lock-to-lock ends up in the
 * gravel, and footage of an empty verge sells nothing.
 */
const rand = (min, max) => min + Math.random() * (max - min);
const start = Date.now();
let steerKey = null;

await page.keyboard.down('ArrowUp');

while ((Date.now() - start) / 1000 < wallClock) {
  const t = (Date.now() - start) / 1000;
  const state = await page.evaluate(() => window.__game.state());
  const x = state.x ?? 0;

  // Drift across the lane on a slow sine so the bike leans through the frame,
  // then override that line to go around anything slow directly ahead. A bot
  // that ploughs into a bus spends the clip stationary.
  let target = Math.sin(t * 0.32) * 0.5;
  const dz = state.hazardDz ?? -1;
  if (dz >= 0 && dz < 7000 && Math.abs(state.hazardX - x) < state.hazardWidth + 0.34) {
    const away = state.hazardX > 0 ? -1 : 1;
    target = Math.max(-0.9, Math.min(0.9, state.hazardX + away * (state.hazardWidth + 0.5)));
  }

  const error = target - x;
  const want = error > 0.07 ? 'ArrowRight' : error < -0.07 ? 'ArrowLeft' : null;

  if (want !== steerKey) {
    if (steerKey) await page.keyboard.up(steerKey);
    if (want) await page.keyboard.down(want);
    steerKey = want;
  }

  // Throw a punch or a kick regularly — the hitstop and sparks are the point.
  if (Math.random() < 0.34) {
    await page.keyboard.press(Math.random() < 0.55 ? 'KeyK' : 'KeyJ');
  }
  // Boost occasionally: the speed lines and the field-of-view punch are the money shot.
  if (Math.random() < 0.10) await page.keyboard.press('ShiftLeft');
  // A horn, because it is that kind of road.
  if (Math.random() < 0.07) await page.keyboard.press('KeyH');

  await page.waitForTimeout(rand(90, 190));
}

if (steerKey) await page.keyboard.up(steerKey);
await page.keyboard.up('ArrowUp');

const state = await page.evaluate(() => window.__game.state());
console.log(`  finished with phase=${state.phase} place=${state.place} fps=${state.fps}`);

const video = page.video();
await context.close();
const raw = await video.path();
await browser.close();

if (errors.length) {
  console.log('  console errors during capture:');
  for (const e of errors.slice(0, 5)) console.log(`    - ${e}`);
}

// Speed the footage back up to real time, which doubles the effective frame rate.
const rawPath = join(outDir, 'gameplay-raw.webm');
renameSync(raw, rawPath);
rmSync(tmpDir, { recursive: true, force: true });

const mp4 = join(outDir, campaign ? 'gameplay-rickshaw.mp4' : 'gameplay.mp4');
const gif = join(outDir, campaign ? 'gameplay-rickshaw.gif' : 'gameplay.gif');
const outFps = Math.round(25 / SLOW);

console.log(`  encoding ${mp4} at ${outFps} fps`);
execFileSync('ffmpeg', [
  '-y', '-i', rawPath,
  '-filter:v', `setpts=${SLOW}*PTS`,
  '-r', String(outFps),
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '20',
  '-pix_fmt', 'yuv420p', '-movflags', '+faststart',
  '-an', mp4,
], { stdio: ['ignore', 'ignore', 'pipe'] });

// A short looping GIF for places that will not play video.
console.log(`  encoding ${gif}`);
execFileSync('ffmpeg', [
  '-y', '-i', mp4, '-t', '10',
  '-filter_complex', '[0:v] fps=20,scale=720:-1:flags=lanczos,split [a][b];[a] palettegen [p];[b][p] paletteuse',
  gif,
], { stdio: ['ignore', 'ignore', 'pipe'] });

const probe = (file) => JSON.parse(execFileSync('ffprobe', [
  '-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', file,
]).toString());

const info = probe(mp4);
const stream = info.streams.find((s) => s.codec_type === 'video');
console.log('\n─── recorded ───');
console.log(`  ${mp4}`);
console.log(`  ${Number(info.format.duration).toFixed(1)}s · ${stream.width}x${stream.height} · ${eval(stream.r_frame_rate)} fps · ${(Number(info.format.size) / 1e6).toFixed(1)} MB`);
if (existsSync(gif)) console.log(`  ${gif}`);
console.log('');
