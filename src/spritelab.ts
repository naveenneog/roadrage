/**
 * Dev-only sprite inspector.
 *
 * The bikes are drawn at roughly 450 px on screen during play, but they are
 * only ever seen for a few frames at a time against a moving road. This page
 * puts every frame side by side at its true size so the artwork can actually be
 * judged. Not part of the shipped bundle — it has its own HTML entry point.
 */
import { SpriteAtlas } from './render/atlas.ts';
import { wheelAnchor } from './render/sprites/bike.ts';
import { BIKES } from './data/bikes.ts';

const atlas = new SpriteAtlas('high');
const grid = document.querySelector('#grid') as HTMLElement;

const SIZE = 300;

const show = (canvas: HTMLCanvasElement, label: string): void => {
  const fig = document.createElement('figure');
  const view = document.createElement('canvas');
  view.width = SIZE;
  view.height = SIZE;
  const ctx = view.getContext('2d');
  if (ctx) {
    // Checker so transparent edges and stray halo are visible.
    for (let y = 0; y < SIZE; y += 20) {
      for (let x = 0; x < SIZE; x += 20) {
        ctx.fillStyle = ((x + y) / 20) % 2 ? '#585d61' : '#4e5357';
        ctx.fillRect(x, y, 20, 20);
      }
    }
    ctx.drawImage(canvas, 0, 0, SIZE, SIZE);
  }
  const cap = document.createElement('figcaption');
  cap.textContent = label;
  fig.append(view, cap);
  grid.append(fig);
};

const params = new URLSearchParams(location.search);
const only = params.get('bike');
const leans = params.get('leans') ? [-2, -1, 0, 1, 2] : [0];

/** Composite body + spun wheel exactly the way the renderer stacks them. */
const composite = (bike: (typeof BIKES)[number], lean: number, angle: number): HTMLCanvasElement => {
  const body = atlas.heroBike(bike, { lean, action: 0, actionSide: 1, down: false, lamp: 0 });
  const out = document.createElement('canvas');
  out.width = body.width;
  out.height = body.height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  if (!bike.threeWheeler) {
    const wheel = atlas.heroWheel(bike);
    const anchor = wheelAnchor(bike);
    const size = anchor.r * 2 * out.height * 1.04;
    ctx.save();
    ctx.translate(out.width * 0.5, anchor.y * out.height);
    ctx.rotate(angle);
    ctx.drawImage(wheel.canvas, -size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.drawImage(body.canvas, 0, 0);
  return out;
};

for (const bike of BIKES) {
  if (only && bike.id !== only) continue;
  for (const lean of leans) {
    show(composite(bike, lean, 0.4), `${bike.name}${lean ? ` lean ${lean}` : ''}`);
  }
  if (params.get('down')) {
    const wreck = atlas.heroBike(bike, {
      lean: 0, action: 0, actionSide: 1, down: true, lamp: 0,
    });
    show(wreck.canvas, `${bike.name} down`);
  }
}

document.title = 'Sprite Lab — ready';
