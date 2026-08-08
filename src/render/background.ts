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
    if (this.backdrop) {
      this.drawBackdrop(ctx, width, height, horizon);
    } else {
      if (!this.sky || !this.far) return;
      const lift = clamp(horizon / height, 0.15, 0.85);
      const skyHeight = height * (lift + 0.12);
      ctx.drawImage(this.sky, 0, 0, this.sky.width, this.sky.height, 0, 0, width, skyHeight);
      this.drawWrapped(ctx, this.far, this.farOffset, width, skyHeight, height);
    }
    if (this.near) {
      const lift = clamp(horizon / height, 0.15, 0.85);
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
