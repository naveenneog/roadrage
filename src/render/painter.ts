export type Ctx2D = CanvasRenderingContext2D;

/**
 * A tiny drawing vocabulary shared by every procedural painter.
 *
 * The painters are deliberately written against a 0..1 normalised box so a
 * sprite can be rasterised at any resolution — the atlas picks a pixel size
 * based on how large the prop will ever appear on screen.
 */
export class Painter {
  constructor(
    readonly ctx: Ctx2D,
    readonly w: number,
    readonly h: number,
  ) {}

  /** Normalised rect: x, y, width, height in 0..1 of the sprite box. */
  rect(x: number, y: number, w: number, h: number, fill: string): this {
    this.ctx.fillStyle = fill;
    this.ctx.fillRect(x * this.w, y * this.h, w * this.w, h * this.h);
    return this;
  }

  /** Rect with a 1px-equivalent darker bottom/right edge, for cheap volume. */
  block(x: number, y: number, w: number, h: number, fill: string, shade: string): this {
    this.rect(x, y, w, h, fill);
    this.rect(x, y + h - h * 0.18, w, h * 0.18, shade);
    this.rect(x + w - w * 0.14, y, w * 0.14, h, shade);
    return this;
  }

  roundRect(x: number, y: number, w: number, h: number, r: number, fill: string): this {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.roundRect(x * this.w, y * this.h, w * this.w, h * this.h, r * this.w);
    ctx.fill();
    return this;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string): this {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.ellipse(cx * this.w, cy * this.h, rx * this.w, ry * this.h, 0, 0, Math.PI * 2);
    ctx.fill();
    return this;
  }

  circle(cx: number, cy: number, r: number, fill: string): this {
    return this.ellipse(cx, cy, r, (r * this.w) / this.h, fill);
  }

  /** Filled polygon from normalised [x, y] pairs. */
  poly(points: ReadonlyArray<readonly [number, number]>, fill: string): this {
    const { ctx } = this;
    if (points.length < 3) return this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    const first = points[0] as readonly [number, number];
    ctx.moveTo(first[0] * this.w, first[1] * this.h);
    for (let i = 1; i < points.length; i++) {
      const p = points[i] as readonly [number, number];
      ctx.lineTo(p[0] * this.w, p[1] * this.h);
    }
    ctx.closePath();
    ctx.fill();
    return this;
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: string, width = 0.02): this {
    const { ctx } = this;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width * this.w);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 * this.w, y1 * this.h);
    ctx.lineTo(x2 * this.w, y2 * this.h);
    ctx.stroke();
    return this;
  }

  /** Quadratic curve — for aerial roots, cables, palm fronds. */
  curve(
    x1: number, y1: number, cx: number, cy: number, x2: number, y2: number,
    stroke: string, width = 0.02,
  ): this {
    const { ctx } = this;
    ctx.strokeStyle = stroke;
    ctx.lineWidth = Math.max(1, width * this.w);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1 * this.w, y1 * this.h);
    ctx.quadraticCurveTo(cx * this.w, cy * this.h, x2 * this.w, y2 * this.h);
    ctx.stroke();
    return this;
  }

  /** Centred text scaled to the sprite box. Used for signage and number plates. */
  text(
    label: string,
    cx: number,
    cy: number,
    size: number,
    fill: string,
    font = 'sans-serif',
    weight = '700',
  ): this {
    const { ctx } = this;
    ctx.save();
    ctx.fillStyle = fill;
    ctx.font = `${weight} ${Math.max(4, size * this.h)}px ${font}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx * this.w, cy * this.h, this.w * 0.94);
    ctx.restore();
    return this;
  }

  /** Vertical gradient fill across a normalised rect. */
  gradient(
    x: number, y: number, w: number, h: number,
    stops: ReadonlyArray<readonly [number, string]>,
  ): this {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, y * this.h, 0, (y + h) * this.h);
    for (const [offset, colour] of stops) grad.addColorStop(offset, colour);
    ctx.fillStyle = grad;
    ctx.fillRect(x * this.w, y * this.h, w * this.w, h * this.h);
    return this;
  }

  /** Deterministic pseudo-random in 0..1 from an integer seed — repeatable detail. */
  static noise(seed: number): number {
    const v = Math.sin(seed * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  }

  /** Scatter small rects — leaves, gravel, rust, crowd heads. */
  scatter(
    count: number,
    seed: number,
    x: number, y: number, w: number, h: number,
    size: number,
    colours: readonly string[],
  ): this {
    for (let i = 0; i < count; i++) {
      const rx = Painter.noise(seed + i * 3.1);
      const ry = Painter.noise(seed + i * 7.7 + 13);
      const rc = Math.floor(Painter.noise(seed + i * 5.3 + 29) * colours.length);
      this.rect(
        x + rx * w, y + ry * h,
        size * (0.6 + Painter.noise(seed + i) * 0.8), size * 1.2,
        colours[rc] ?? '#000',
      );
    }
    return this;
  }

  save(): this {
    this.ctx.save();
    return this;
  }

  restore(): this {
    this.ctx.restore();
    return this;
  }

  /** Rotate about a normalised pivot; used for lean, tilt and swinging limbs. */
  rotate(radians: number, px = 0.5, py = 1): this {
    this.ctx.translate(px * this.w, py * this.h);
    this.ctx.rotate(radians);
    this.ctx.translate(-px * this.w, -py * this.h);
    return this;
  }

  translate(dx: number, dy: number): this {
    this.ctx.translate(dx * this.w, dy * this.h);
    return this;
  }

  scale(sx: number, sy: number, px = 0.5, py = 1): this {
    this.ctx.translate(px * this.w, py * this.h);
    this.ctx.scale(sx, sy);
    this.ctx.translate(-px * this.w, -py * this.h);
    return this;
  }

  alpha(value: number): this {
    this.ctx.globalAlpha = value;
    return this;
  }

  /**
   * Lay a light gradient over only the pixels already drawn.
   *
   * `source-atop` clips to the existing artwork, so this acts as a cheap
   * top-down key light on the sprite's own silhouette — the single most
   * effective thing for making a flat-shaded sprite read as a solid object
   * against a similarly-toned background.
   */
  keyLight(strength = 0.18, warm = '#ffffff', cool = '#000010'): this {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    const grad = ctx.createLinearGradient(0, 0, 0, this.h);
    grad.addColorStop(0, `rgba(255,255,255,${strength})`);
    grad.addColorStop(0.42, 'rgba(255,255,255,0)');
    grad.addColorStop(1, `rgba(0,0,16,${strength * 1.4})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
    void warm;
    void cool;
    return this;
  }

  /**
   * Draw a hard dark outline behind everything already on the canvas.
   *
   * The silhouette is stamped in eight directions underneath the artwork, which
   * dilates it by `thickness` pixels in every direction. Unlike a blur this
   * keeps a crisp edge, and a crisp dark edge is the single reason classic
   * sprite art stays readable against a busy road at any size.
   */
  outline(canvas: HTMLCanvasElement, thickness = 3): this {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    // `brightness(0)` recolours the stamped copies to flat black while keeping
    // their alpha, so only the silhouette is darkened — never the whole box.
    ctx.filter = 'brightness(0) saturate(0)';
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.drawImage(
        canvas,
        Math.round(Math.cos(a) * thickness),
        Math.round(Math.sin(a) * thickness),
        this.w, this.h,
      );
    }
    ctx.restore();
    return this;
  }

  /**
   * Draw a dark halo behind everything already on the canvas.
   *
   * `destination-over` paints underneath, so a blurred copy of the silhouette
   * becomes a soft outline that separates the sprite from the road without
   * touching the artwork itself.
   */
  haloBehind(canvas: HTMLCanvasElement, blur = 6, alpha = 0.45): this {
    const { ctx } = this;
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.globalAlpha = alpha;
    ctx.filter = `blur(${blur}px) brightness(0)`;
    ctx.drawImage(canvas, 0, 0, this.w, this.h);
    ctx.restore();
    return this;
  }
}
