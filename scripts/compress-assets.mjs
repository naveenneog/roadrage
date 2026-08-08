import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Compress generated PNG backdrops to WebP and delete the originals.
 *
 * These are flat vector-style images, so WebP at quality 82 takes them from
 * ~1.5 MB to ~50 KB with no visible loss — which is the difference between
 * shipping them and not.
 *
 * Usage: node scripts/compress-assets.mjs [dir] [--keep-png]
 */
const dir = process.argv.find((a) => !a.startsWith('--') && a !== process.argv[0]
  && a !== process.argv[1]) ?? 'public/generated';
const keepPng = process.argv.includes('--keep-png');
const WIDTH = 1280;
const QUALITY = 82;

const pngs = readdirSync(dir).filter((f) => f.endsWith('.png'));
if (pngs.length === 0) {
  console.log(`no PNGs in ${dir} — run "npm run assets" first`);
  process.exit(0);
}

let before = 0;
let after = 0;

for (const png of pngs) {
  const src = join(dir, png);
  const out = src.replace(/\.png$/, '.webp');
  execFileSync('ffmpeg', [
    '-y', '-i', src,
    '-vf', `scale=${WIDTH}:-1`,
    '-c:v', 'libwebp', '-quality', String(QUALITY), '-compression_level', '6',
    out,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });

  const a = statSync(src).size;
  const b = statSync(out).size;
  before += a;
  after += b;
  console.log(`  ${png.padEnd(30)} ${(a / 1024).toFixed(0).padStart(5)} KB -> ${(b / 1024).toFixed(0).padStart(4)} KB`);
  if (!keepPng) unlinkSync(src);
}

console.log(`\ntotal ${(before / 1024 / 1024).toFixed(1)} MB -> ${(after / 1024).toFixed(0)} KB`);
if (!keepPng) console.log('(PNG originals removed; pass --keep-png to keep them)');
