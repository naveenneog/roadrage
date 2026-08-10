import { BIKES } from '../data/bikes.ts';
import type { BikeSpec } from '../data/types.ts';
import { statBars } from '../game/tuning.ts';
import { SpriteAtlas } from '../render/atlas.ts';
import { wheelAnchor } from '../render/sprites/bike.ts';
import type { SaveData } from '../core/storage.ts';

/** Machines you can actually buy — the three-wheeler is campaign-only. */
export const SHOWROOM = BIKES.filter((b) => b.class !== 'auto');

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const rupees = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

export interface GarageActions {
  buyBike(bikeId: string): boolean;
  selectBike(bikeId: string): void;
  save(): SaveData;
  back(): void;
}

/** Canvas size of the spotlight stage, in CSS pixels before DPR scaling. */
const STAGE_W = 440;
const STAGE_H = 330;

/**
 * The garage, built around a lit stage rather than a wall of text.
 *
 * The previous version was a grid of `<button>` cards. A button cannot be made
 * to grow to its content as a grid item, so every card was clipped to the first
 * row's height and the overflow painted straight over the card below it — all
 * twelve of them. Rebuilding around a single spotlit machine fixes that by
 * construction and, more to the point, means you can actually see what you are
 * buying: these bikes are the reason the game exists.
 */
export class Garage {
  private readonly atlas = new SpriteAtlas('high');
  private canvas: HTMLCanvasElement | null = null;
  private raf = 0;
  private spin = 0;
  private viewing: BikeSpec;

  constructor(private readonly actions: GarageActions) {
    const save = actions.save();
    this.viewing = SHOWROOM.find((b) => b.id === save.currentBike) ?? (SHOWROOM[0] as BikeSpec);
  }

  /** Stop the stage animation. The screen manager calls this on every change. */
  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.canvas = null;
  }

  build(): HTMLElement {
    const save = this.actions.save();
    const node = el('section', 'screen garage');
    node.id = 'screen-garage';

    const head = el('div', 'garage-head');
    head.append(el('h1', 'title', 'GARAGE'));
    head.append(el('span', 'cash', rupees(save.cash)));
    node.append(head);

    const stage = el('div', 'garage-stage');
    stage.append(this.buildCanvas());
    stage.append(this.buildSpec(save));
    node.append(stage);

    node.append(this.buildRail(save));

    const row = el('div', 'row');
    const back = el('button', 'ghost', '← Back');
    back.addEventListener('click', () => { this.dispose(); this.actions.back(); });
    row.append(back);
    node.append(row);

    this.start();
    return node;
  }

  private buildCanvas(): HTMLElement {
    const wrap = el('div', 'spotlight');
    const canvas = el('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = STAGE_W * dpr;
    canvas.height = STAGE_H * dpr;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', `${this.viewing.maker} ${this.viewing.name} on the showroom floor`);
    this.canvas = canvas;
    wrap.append(canvas);
    return wrap;
  }

  /** Redraw the stage. Cheap enough to run every frame at this size. */
  private paint(): void {
    const canvas = this.canvas;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    const bike = this.viewing;
    const accent = bike.palette.accent;

    ctx.clearRect(0, 0, w, h);

    // The lit cone falling from above, and the pool it throws on the floor.
    const floorY = h * 0.86;
    const cone = ctx.createLinearGradient(0, 0, 0, floorY);
    cone.addColorStop(0, 'rgba(255,238,200,0.20)');
    cone.addColorStop(1, 'rgba(255,238,200,0)');
    ctx.fillStyle = cone;
    ctx.beginPath();
    ctx.moveTo(w * 0.5 - w * 0.10, 0);
    ctx.lineTo(w * 0.5 + w * 0.10, 0);
    ctx.lineTo(w * 0.5 + w * 0.46, floorY);
    ctx.lineTo(w * 0.5 - w * 0.46, floorY);
    ctx.closePath();
    ctx.fill();

    const pool = ctx.createRadialGradient(w * 0.5, floorY, 0, w * 0.5, floorY, w * 0.46);
    pool.addColorStop(0, 'rgba(255,236,190,0.26)');
    pool.addColorStop(0.55, 'rgba(255,220,160,0.08)');
    pool.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.ellipse(w * 0.5, floorY, w * 0.46, h * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();

    // A rim of the machine's own accent colour, so each bike lights its stage
    // differently — the Duke's orange and the Enfield's cream are not the same
    // showroom.
    ctx.save();
    ctx.globalAlpha = 0.16;
    const rim = ctx.createRadialGradient(w * 0.5, h * 0.52, 0, w * 0.5, h * 0.52, w * 0.42);
    rim.addColorStop(0, accent);
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rim;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // The machine, breathing gently so the stage is never a still photograph.
    const bob = Math.sin(this.spin * 0.9) * h * 0.006;
    const destH = h * 0.74;
    const body = this.atlas.heroBike(bike, {
      lean: 0, action: 0, actionSide: 1, down: false, lamp: 0,
    });
    const destW = (body.width / body.height) * destH;
    const x = w * 0.5 - destW / 2;
    const y = floorY - destH + bob;

    // Contact shadow, tight and dark so the bike is standing on the floor.
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(w * 0.5, floorY - h * 0.004, destW * 0.20, h * 0.018, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if (!bike.threeWheeler) {
      const wheel = this.atlas.heroWheel(bike);
      const anchor = wheelAnchor(bike);
      const size = anchor.r * 2 * destH * 1.04;
      ctx.save();
      ctx.translate(x + destW * 0.5, y + anchor.y * destH);
      // Idles slowly rather than sitting dead — a showroom turntable, not a spin.
      ctx.rotate(this.spin * 0.35);
      ctx.drawImage(wheel.canvas, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.drawImage(body.canvas, x, y, destW, destH);
  }

  private start(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    let last = performance.now();
    const tick = (now: number): void => {
      if (!this.canvas || !this.canvas.isConnected) { this.raf = 0; return; }
      this.spin += Math.min(0.05, (now - last) / 1000);
      last = now;
      this.paint();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private buildSpec(save: SaveData): HTMLElement {
    const bike = this.viewing;
    const owned = save.ownedBikes.includes(bike.id);
    const selected = save.currentBike === bike.id;
    const affordable = save.cash >= bike.price;

    const panel = el('div', 'garage-spec');
    panel.append(el('span', 'maker', bike.maker));
    panel.append(el('h2', 'name', bike.name));
    panel.append(el('span', 'meta',
      `${bike.cc}cc · ${bike.bhp} bhp · ${bike.weightKg} kg · ${bike.topSpeedKmh} km/h · ${bike.era}`));
    panel.append(el('p', 'blurb', bike.blurb));

    const bars = el('div', 'bars');
    for (const [label, value] of Object.entries(statBars(bike, SHOWROOM))) {
      const bar = el('div', 'bar');
      bar.append(el('span', undefined, label));
      const track = el('span', 'track');
      const fill = el('i');
      fill.style.width = `${Math.round(value * 100)}%`;
      track.append(fill);
      bar.append(track);
      bars.append(bar);
    }
    panel.append(bars);
    panel.append(el('p', 'note', bike.note));

    const action = el('button', 'primary');
    if (selected) {
      action.textContent = '✓ In the garage';
      action.disabled = true;
    } else if (owned) {
      action.textContent = 'Ride this';
      action.addEventListener('click', () => { this.actions.selectBike(bike.id); this.refresh(); });
    } else if (affordable) {
      action.textContent = `Buy · ${rupees(bike.price)}`;
      action.addEventListener('click', () => {
        if (this.actions.buyBike(bike.id)) this.refresh();
      });
    } else {
      action.textContent = `Locked · ${rupees(bike.price)}`;
      action.disabled = true;
      action.classList.add('locked');
    }
    panel.append(action);
    return panel;
  }

  private buildRail(save: SaveData): HTMLElement {
    const rail = el('div', 'garage-rail');
    rail.setAttribute('role', 'listbox');
    rail.setAttribute('aria-label', 'Available machines');
    for (const bike of SHOWROOM) {
      const owned = save.ownedBikes.includes(bike.id);
      const chip = el('button', 'chip');
      chip.setAttribute('role', 'option');
      chip.setAttribute('aria-selected', String(bike.id === this.viewing.id));
      if (bike.id === this.viewing.id) chip.classList.add('viewing');
      if (save.currentBike === bike.id) chip.classList.add('owned');
      chip.append(el('span', 'chip-maker', bike.maker));
      chip.append(el('span', 'chip-name', bike.name));
      chip.append(el('span', owned ? 'chip-tag' : 'chip-price',
        owned ? (save.currentBike === bike.id ? 'RIDING' : 'OWNED') : rupees(bike.price)));
      chip.addEventListener('click', () => {
        this.viewing = bike;
        this.refresh();
      });
      rail.append(chip);
    }
    return rail;
  }

  /** Rebuild in place, keeping which machine is on the stage. */
  private refresh(): void {
    const host = document.querySelector('#screen-garage');
    if (!host?.parentElement) return;
    this.dispose();
    host.parentElement.replaceChild(this.build(), host);
    document.querySelector<HTMLElement>('.chip.viewing')?.focus({ preventScroll: true });
  }
}
