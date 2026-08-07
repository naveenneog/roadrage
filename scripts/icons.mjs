import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Generates the PWA icons — procedurally, like everything else in this game.
 *
 * A rear-view motorcycle silhouette on the game's ink background, with enough
 * margin that the maskable variant survives Android's circular crop.
 *
 * Run: node scripts/icons.mjs
 */
const OUT = 'public/icons';
mkdirSync(OUT, { recursive: true });

const draw = (size, maskable) => {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const s = size;
  // Maskable icons lose the outer 20% to the platform's crop, so the artwork
  // is drawn inside a safe zone and the background is bled to the edges.
  const pad = maskable ? s * 0.20 : s * 0.08;
  const inner = s - pad * 2;
  const u = (v) => pad + v * inner;

  ctx.fillStyle = '#0b0d12';
  ctx.fillRect(0, 0, s, s);

  // Warm glow behind the bike, the same saffron as the title screen.
  const glow = ctx.createRadialGradient(s / 2, s * 0.58, s * 0.05, s / 2, s * 0.58, s * 0.5);
  glow.addColorStop(0, 'rgba(232, 115, 28, 0.55)');
  glow.addColorStop(1, 'rgba(232, 115, 28, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, s, s);

  // Road, receding.
  ctx.fillStyle = '#2a2d33';
  ctx.beginPath();
  ctx.moveTo(u(0.36), u(0.52));
  ctx.lineTo(u(0.64), u(0.52));
  ctx.lineTo(u(1.02), u(1.02));
  ctx.lineTo(u(-0.02), u(1.02));
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#f0a828';
  ctx.beginPath();
  ctx.moveTo(u(0.485), u(0.54));
  ctx.lineTo(u(0.515), u(0.54));
  ctx.lineTo(u(0.56), u(1.0));
  ctx.lineTo(u(0.44), u(1.0));
  ctx.closePath();
  ctx.fill();

  const rounded = (x, y, w, h, r, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(u(x), u(y), inner * w, inner * h, inner * r);
    ctx.fill();
  };
  const ellipse = (cx, cy, rx, ry, fill) => {
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(u(cx), u(cy), inner * rx, inner * ry, 0, 0, Math.PI * 2);
    ctx.fill();
  };

  // Rear wheel.
  ellipse(0.5, 0.83, 0.11, 0.11, '#0f1114');
  ellipse(0.5, 0.83, 0.05, 0.05, '#8f96a0');
  // Tail, seat, tank.
  rounded(0.40, 0.60, 0.20, 0.14, 0.03, '#1b1e24');
  rounded(0.36, 0.52, 0.28, 0.08, 0.03, '#2f4230');
  rounded(0.34, 0.44, 0.32, 0.09, 0.04, '#e8731c');
  // Rider.
  rounded(0.41, 0.24, 0.18, 0.22, 0.06, '#3c4a63');
  ellipse(0.5, 0.22, 0.085, 0.065, '#e8e8ea');
  // Handlebars.
  ctx.strokeStyle = '#c2c6cc';
  ctx.lineWidth = inner * 0.028;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(u(0.30), u(0.34));
  ctx.lineTo(u(0.70), u(0.34));
  ctx.stroke();
  // Tail lamp.
  rounded(0.455, 0.635, 0.09, 0.035, 0.015, '#e03a2f');

  return canvas.toBuffer('image/png');
};

const targets = [
  { name: 'icon-192.png', size: 192, maskable: false },
  { name: 'icon-512.png', size: 512, maskable: false },
  { name: 'icon-maskable-512.png', size: 512, maskable: true },
  { name: 'apple-touch-icon.png', size: 180, maskable: false },
];

for (const { name, size, maskable } of targets) {
  writeFileSync(join(OUT, name), draw(size, maskable));
  console.log(`wrote ${OUT}/${name}  ${size}x${size}${maskable ? ' (maskable)' : ''}`);
}
