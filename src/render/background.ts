import { clamp } from '../core/math.ts';
import type { SkyPalette, TimeOfDay } from '../data/types.ts';
import { Painter } from './painter.ts';
import { darken, lighten, withAlpha } from './palette.ts';

/**
 * Sky and skyline, drawn once into layered canvases and scrolled parallax.
 *
 * The horizon is the single biggest carrier of place and hour: the same road
 * under a Bengaluru dawn and a Mumbai night is two different games.
 */
export class Background {
  private sky: HTMLCanvasElement | null = null;
  private far: HTMLCanvasElement | null = null;
  private near: HTMLCanvasElement | null = null;
  /** Local monuments, drawn over whichever skyline is in use. */
  private landmarks: HTMLCanvasElement | null = null;
  private builtFor = '';
  /** Optional painted backdrop replacing the procedural sky and skyline. */
  private backdrop: HTMLImageElement | null = null;
  private backdropSrc = '';
  /** Fraction of the backdrop's height at which its ground line sits. */
  private backdropHorizon = 0.92;

  skyOffset = 0;
  farOffset = 0;
  nearOffset = 0;

  /**
   * Load a painted backdrop for this circuit.
   *
   * These are generated once, offline, and shipped as small WebP files. They
   * replace the procedural sky and skyline only — the near tree line still
   * draws on top, and the game runs perfectly without them if the load fails,
   * which keeps the whole thing an enhancement rather than a dependency.
   */
  setBackdrop(src: string | null, horizon = 0.92): void {
    if (!src) {
      this.backdrop = null;
      this.backdropSrc = '';
      return;
    }
    if (src === this.backdropSrc) return;
    this.backdropSrc = src;
    this.backdropHorizon = horizon;
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      // Ignore a load that finished after the circuit already changed.
      if (this.backdropSrc === src) this.backdrop = image;
    };
    image.onerror = () => {
      if (this.backdropSrc === src) this.backdrop = null;
    };
    image.src = src;
  }

  /** Rebuild the layers for a circuit. Cheap enough to call on every race start. */
  build(palette: SkyPalette, timeOfDay: TimeOfDay, city: string, width: number, height: number): void {
    const key = `${city}:${timeOfDay}:${width}x${height}`;
    if (this.builtFor === key) return;
    this.builtFor = key;

    // Layers are drawn twice as wide as the viewport so they can wrap seamlessly.
    const w = Math.max(320, Math.round(width));
    const h = Math.max(180, Math.round(height));

    this.sky = this.layer(w, h, (p) => this.paintSky(p, palette, timeOfDay));
    this.far = this.layer(w * 2, h, (p) => this.paintFar(p, palette, timeOfDay, city));
    this.landmarks = this.layer(w * 2, h,
      (p) => this.paintLandmarks(p, palette.skyline, timeOfDay, city));
    this.near = this.layer(w * 2, h, (p) => this.paintNear(p, palette, timeOfDay, city));
  }

  private layer(w: number, h: number, draw: (p: Painter) => void): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (ctx) draw(new Painter(ctx, w, h));
    return canvas;
  }

  private paintSky(p: Painter, palette: SkyPalette, timeOfDay: TimeOfDay): void {
    p.gradient(0, 0, 1, 1, [
      [0, palette.top],
      [0.45, palette.middle],
      [0.82, palette.horizon],
      [1, palette.haze],
    ]);

    if (palette.sun) {
      const sunY = timeOfDay === 'dawn' ? 0.62 : timeOfDay === 'dusk' ? 0.66 : 0.22;
      p.ellipse(0.68, sunY, 0.16, 0.20, withAlpha(palette.sun, 0.20));
      p.ellipse(0.68, sunY, 0.09, 0.11, withAlpha(palette.sun, 0.45));
      p.ellipse(0.68, sunY, 0.045, 0.055, palette.sun);
    }

    if (timeOfDay === 'night') {
      for (let i = 0; i < 90; i++) {
        const x = Painter.noise(i * 3.7);
        const y = Painter.noise(i * 9.1) * 0.55;
        const bright = Painter.noise(i * 5.3);
        p.rect(x, y, 0.0025, 0.004, withAlpha('#ffffff', 0.25 + bright * 0.55));
      }
      p.ellipse(0.18, 0.16, 0.035, 0.045, withAlpha('#e8eef5', 0.9));
      p.ellipse(0.165, 0.15, 0.030, 0.040, withAlpha('#0c1224', 0.55));
    }

    if (timeOfDay === 'monsoon') {
      // Low, heavy, layered cloud.
      for (let i = 0; i < 7; i++) {
        const y = 0.10 + i * 0.09;
        p.ellipse(Painter.noise(i * 4.1), y, 0.4, 0.07,
          withAlpha(i % 2 ? '#7e8b96' : '#6d7a86', 0.45));
      }
    } else if (timeOfDay !== 'night') {
      for (let i = 0; i < 5; i++) {
        const x = Painter.noise(i * 6.7);
        const y = 0.10 + Painter.noise(i * 2.3) * 0.28;
        p.ellipse(x, y, 0.16, 0.035, withAlpha('#ffffff', 0.22));
        p.ellipse(x + 0.06, y - 0.012, 0.10, 0.026, withAlpha('#ffffff', 0.18));
      }
    }
  }

  /** Distant silhouette: city skyline, or ghat ridgeline, or open sea. */
  private paintFar(p: Painter, palette: SkyPalette, timeOfDay: TimeOfDay, city: string): void {
    const base = 0.82;
    const colour = palette.skyline;

    if (city === 'thane' || city === 'mumbai') {
      // Hills behind the towers — Yeoor ridge, or the Ghats beyond Thane creek.
      p.poly([
        [0, base], [0.12, 0.70], [0.26, 0.76], [0.40, 0.66], [0.55, 0.74],
        [0.70, 0.64], [0.85, 0.73], [1, 0.68], [1, 1], [0, 1],
      ], darken(colour, 0.2));
    }

    const towers = city === 'goa' ? 0 : city === 'delhi' ? 14 : 26;
    for (let i = 0; i < towers; i++) {
      const x = i / towers;
      const w = 0.018 + Painter.noise(i * 3.3) * 0.045;
      const h = 0.06 + Painter.noise(i * 7.9) * (city === 'mumbai' ? 0.26 : 0.16);
      p.rect(x, base - h, w, h + 0.2, colour);
      if (timeOfDay === 'night') {
        for (let f = 0; f < 6; f++) {
          if (Painter.noise(i * 11 + f) > 0.62) {
            p.rect(x + w * 0.25, base - h + f * (h / 6) + 0.006, w * 0.5, 0.006,
              withAlpha('#ffd98a', 0.75));
          }
        }
      }
    }

    if (city === 'goa' || city === 'mumbai') {
      // Sea meeting the sky.
      p.rect(0, base, 1, 0.2, withAlpha(timeOfDay === 'night' ? '#12203a' : '#3f6b7d', 0.85));
      for (let i = 0; i < 22; i++) {
        p.rect(Painter.noise(i * 2.7), base + 0.02 + Painter.noise(i * 5.1) * 0.14,
          0.05, 0.004, withAlpha('#ffffff', 0.18));
      }
    }

    // Landmarks last, so they sit in front of the generic tower run.
    this.paintLandmarks(p, colour, timeOfDay, city);
  }

  /**
   * Landmarks the locals would actually recognise.
   *
   * Drawn as flat silhouettes into the far layer, on top of the generic tower
   * run. Proportion matters more than detail at this distance: the Vidhana
   * Soudha reads because it is a long low block with a stepped central dome,
   * and CST because of its one tall gabled clock tower. Anything finer than
   * that is invisible by the time it is composited behind the haze.
   */
  private paintLandmarks(p: Painter, colour: string, timeOfDay: TimeOfDay, city: string): void {
    // Higher than the generic skyline base: the horizon band is crowded with
    // shopfronts, trees and traffic, and a monument sitting level with them is
    // simply never seen. These need to clear the roofline.
    const base = 0.68;
    const lit = withAlpha('#ffd98a', timeOfDay === 'night' ? 0.5 : 0.16);
    // Monuments read a shade lighter than the anonymous tower run behind them,
    // which is both true of floodlit stone and the only way the silhouette
    // separates from the skyline it sits against.
    const stone = timeOfDay === 'night'
      ? lighten(colour, 0.14)
      : lighten(colour, 0.26);

    /** A dome on a drum, the shape half of these buildings are built around. */
    const dome = (cx: number, y: number, r: number, fill: string): void => {
      p.ellipse(cx, y, r, r * 0.92, fill);
      p.rect(cx - r, y, r * 2, r * 0.5, fill);
      p.rect(cx - r * 0.045, y - r * 1.5, r * 0.09, r * 0.55, fill);
    };

    // Landmarks are landmarks because they are bigger than everything around
    // them. Scaled about the skyline base so they stand proud of the towers.
    //
    // The x factor also halves, because this layer is authored two viewports
    // wide so it can wrap seamlessly — without that, a monument written at
    // x = 0.3 lands at 0.6 on screen and the set smears into one grey band.
    p.save();
    p.scale(0.30, 1.55, 0, base);

    if (city === 'bengaluru') {
      // Vidhana Soudha: a long neo-Dravidian block, stepped, with a central dome.
      const y = base - 0.10;
      p.rect(0.30, y, 0.30, 0.10, stone);
      p.rect(0.335, y - 0.028, 0.23, 0.030, stone);
      p.rect(0.385, y - 0.052, 0.13, 0.026, stone);
      dome(0.45, y - 0.062, 0.036, stone);
      // The corner turrets that make the roofline read as this building.
      for (const x of [0.315, 0.375, 0.525, 0.585]) dome(x, y - 0.010, 0.016, stone);
      if (timeOfDay === 'night') p.rect(0.30, y + 0.03, 0.30, 0.012, lit);

      // Bangalore Palace: Tudor towers with crenellations, off to the left.
      p.rect(0.10, base - 0.07, 0.12, 0.07, stone);
      for (const x of [0.105, 0.175]) {
        p.rect(x, base - 0.105, 0.032, 0.105, stone);
        for (let i = 0; i < 3; i++) p.rect(x + i * 0.012, base - 0.117, 0.008, 0.014, stone);
      }
      // St Mary's Basilica spire, further right.
      p.rect(0.70, base - 0.075, 0.020, 0.075, stone);
      p.poly([[0.70, base - 0.075], [0.71, base - 0.135], [0.72, base - 0.075]], stone);
    }

    if (city === 'mumbai') {
      // Chhatrapati Shivaji Terminus: one tall gabled clock tower on a long hall.
      const y = base - 0.09;
      p.rect(0.24, y, 0.26, 0.09, stone);
      p.rect(0.335, y - 0.075, 0.05, 0.075, stone);
      dome(0.36, y - 0.082, 0.032, stone);
      for (const x of [0.255, 0.465]) dome(x, y - 0.012, 0.018, stone);
      // Gateway of India: a squat arch on the water.
      p.rect(0.62, base - 0.06, 0.10, 0.06, stone);
      p.rect(0.655, base - 0.032, 0.03, 0.032, timeOfDay === 'night' ? '#0d1220' : darken(colour, 0.4));
      for (const x of [0.625, 0.705]) dome(x, base - 0.070, 0.014, stone);
      dome(0.67, base - 0.078, 0.020, stone);
    }

    if (city === 'thane' || city === 'pune') {
      // No single silhouette defines these, so it is a temple gopuram and the
      // mill chimneys — which is what the skyline actually looks like.
      p.poly([
        [0.32, base], [0.345, base - 0.085], [0.395, base - 0.085], [0.42, base],
      ], stone);
      p.rect(0.345, base - 0.098, 0.05, 0.014, stone);
      for (const x of [0.60, 0.66]) {
        p.rect(x, base - 0.11, 0.014, 0.11, stone);
        p.rect(x - 0.004, base - 0.118, 0.022, 0.010, stone);
      }
    }

    if (city === 'delhi') {
      // Jama Masjid: three bulbous domes between two minarets.
      const y = base - 0.055;
      p.rect(0.30, y, 0.24, 0.055, stone);
      dome(0.42, y - 0.030, 0.045, stone);
      dome(0.355, y - 0.014, 0.026, stone);
      dome(0.485, y - 0.014, 0.026, stone);
      for (const x of [0.295, 0.545]) {
        p.rect(x, base - 0.145, 0.016, 0.145, stone);
        dome(x + 0.008, base - 0.152, 0.014, stone);
      }
      // Red Fort: a long crenellated wall with the Lahori Gate.
      p.rect(0.62, base - 0.048, 0.26, 0.048, stone);
      for (let i = 0; i < 13; i++) p.rect(0.62 + i * 0.02, base - 0.058, 0.010, 0.012, stone);
      p.rect(0.71, base - 0.078, 0.055, 0.030, stone);
      for (const x of [0.712, 0.748]) dome(x, base - 0.086, 0.013, stone);
    }

    if (city === 'goa') {
      // Bom Jesus / Se Cathedral: a Portuguese baroque facade and a bell tower.
      const y = base - 0.075;
      p.rect(0.40, y, 0.14, 0.075, stone);
      p.poly([[0.40, y], [0.47, y - 0.038], [0.54, y], [0.40, y]], stone);
      p.rect(0.545, y - 0.030, 0.035, 0.105, stone);
      p.rect(0.540, y - 0.042, 0.045, 0.014, stone);
      p.rect(0.462, y - 0.062, 0.006, 0.026, stone);
      p.rect(0.452, y - 0.054, 0.026, 0.006, stone);
    }

    p.restore();
  }

  /** Nearer silhouette: tree line, or the second rank of buildings. */
  private paintNear(p: Painter, palette: SkyPalette, timeOfDay: TimeOfDay, city: string): void {
    const colour = darken(palette.skyline, 0.35);
    const base = 0.9;

    if (city === 'goa') {
      for (let i = 0; i < 26; i++) {
        const x = i / 26 + Painter.noise(i) * 0.02;
        const h = 0.16 + Painter.noise(i * 3.1) * 0.10;
        p.rect(x, base - h, 0.006, h, colour);
        for (let f = 0; f < 7; f++) {
          const a = (f / 6) * Math.PI;
          p.curve(x, base - h, x - Math.cos(a) * 0.03, base - h - Math.sin(a) * 0.03,
            x - Math.cos(a) * 0.05, base - h - Math.sin(a) * 0.02 + 0.02, colour, 0.006);
        }
      }
    } else {
      for (let i = 0; i < 40; i++) {
        const x = i / 40;
        const h = 0.07 + Painter.noise(i * 4.7) * 0.10;
        p.ellipse(x, base - h, 0.028, h * 0.7, colour);
        p.rect(x - 0.003, base - h, 0.006, h, darken(colour, 0.2));
      }
    }

    if (timeOfDay === 'night') {
      // Sodium haze sitting over the rooftops.
      p.gradient(0, base - 0.16, 1, 0.16, [
        [0, 'rgba(0,0,0,0)'],
        [1, withAlpha('#ffb04d', 0.10)],
      ]);
    }
    if (timeOfDay === 'monsoon') {
      p.rect(0, 0, 1, 1, withAlpha(lighten(palette.haze, 0.1), 0.18));
    }
  }

  /** Scroll the layers. `curve` and `speed` come from the segment under the camera. */
  update(dt: number, curve: number, speedPercent: number, uphill: number): void {
    const drift = curve * speedPercent * dt;
    this.skyOffset = (this.skyOffset + drift * 0.06 + uphill * dt * 0.01) % 1;
    this.farOffset = (this.farOffset + drift * 0.16) % 1;
    this.nearOffset = (this.nearOffset + drift * 0.30) % 1;
  }

  /** Draw all layers. `horizon` is the screen y of the road's vanishing point. */
  draw(ctx: CanvasRenderingContext2D, width: number, height: number, horizon: number): void {
    const lift = clamp(horizon / height, 0.15, 0.85);
    if (this.backdrop) {
      this.drawBackdrop(ctx, width, height, horizon);
    } else {
      if (!this.sky || !this.far) return;
      const skyHeight = height * (lift + 0.12);
      ctx.drawImage(this.sky, 0, 0, this.sky.width, this.sky.height, 0, 0, width, skyHeight);
      this.drawWrapped(ctx, this.far, this.farOffset, width, skyHeight, height);
    }
    // Landmarks sit in their own layer so they survive a painted backdrop. The
    // generated skylines are generic city shapes; the point of these is that a
    // local recognises exactly where they are, so they must always draw.
    if (this.landmarks) {
      this.drawWrapped(ctx, this.landmarks, this.farOffset, width, height * (lift + 0.12), height);
    }
    if (this.near) {
      this.drawWrapped(ctx, this.near, this.nearOffset, width, height * (lift + 0.12), height);
    }
  }

  /**
   * Paint the backdrop so its ground line lands on the road's vanishing point.
   *
   * Tiles are mirrored alternately rather than repeated: a generated image is
   * not seamless, and flipping every other copy makes the join match exactly at
   * both edges for free.
   */
  private drawBackdrop(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    horizon: number,
  ): void {
    const image = this.backdrop;
    if (!image || !image.width) return;

    // Scale so the image is at least as wide as the viewport, and tall enough
    // that its ground line sits on the horizon with sky filling everything above.
    const drawH = Math.max(horizon / this.backdropHorizon, height * 0.62);
    const drawW = Math.max(drawH * (image.width / image.height), width * 0.6);
    const top = horizon - drawH * this.backdropHorizon;

    // Fill any sky above the image with its own top-row colour rather than
    // leaving a gap on very wide viewports.
    if (top > 0) {
      ctx.drawImage(image, 0, 0, image.width, 1, 0, 0, width, top + 1);
    }

    const shift = ((this.farOffset % 1) + 1) % 1;
    const startIndex = Math.floor(-shift);
    let index = startIndex;
    let x = (startIndex - shift) * drawW;

    ctx.save();
    while (x < width) {
      if (((index % 2) + 2) % 2 === 0) {
        ctx.drawImage(image, x, top, drawW, drawH);
      } else {
        // Mirrored copy: translate to the tile's right edge and flip.
        ctx.translate(x + drawW, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(image, 0, top, drawW, drawH);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      }
      x += drawW;
      index++;
    }
    ctx.restore();
  }

  private drawWrapped(
    ctx: CanvasRenderingContext2D,
    layer: HTMLCanvasElement,
    offset: number,
    width: number,
    bandBottom: number,
    height: number,
  ): void {
    const bandHeight = height * 0.5;
    const top = bandBottom - bandHeight;
    const shift = ((offset % 1) + 1) % 1;
    const sx = shift * layer.width;
    const firstWidth = layer.width - sx;

    ctx.drawImage(layer, sx, 0, firstWidth, layer.height,
      0, top, (firstWidth / layer.width) * width * 2, bandHeight);
    ctx.drawImage(layer, 0, 0, sx, layer.height,
      (firstWidth / layer.width) * width * 2, top, (sx / layer.width) * width * 2, bandHeight);
  }
}
