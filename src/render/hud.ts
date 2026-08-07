import { clamp, formatTime, ordinal, toKmh } from '../core/math.ts';
import type { CircuitSpec } from '../data/types.ts';
import type { Race } from '../game/race.ts';
import type { Racer } from '../game/racer.ts';
import { TOUCH_ZONES } from '../core/input.ts';
import { withAlpha } from './palette.ts';

export interface Toast {
  text: string;
  tone: 'good' | 'bad' | 'info';
  life: number;
}

export interface StoryLine {
  speaker: string;
  line: string;
  life: number;
  total: number;
}

const FONT = '"Bahnschrift", "DIN Alternate", "Segoe UI", system-ui, sans-serif';
const MONO = 'ui-monospace, "Cascadia Mono", Menlo, monospace';

const GOOD = '#5fd48a';
const BAD = '#e8543f';
const WARN = '#f0a828';
const INK = '#0d1015';

/**
 * The heads-up display.
 *
 * Everything here is sized in fractions of the canvas so the same code serves a
 * 1920-wide desktop and a 360-wide phone in landscape; the touch controls fade
 * in only when a thumb has actually touched the glass.
 */
export class Hud {
  private toasts: Toast[] = [];
  private story: StoryLine | null = null;
  private countdownPulse = 0;

  toast(text: string, tone: Toast['tone'] = 'info'): void {
    this.toasts.push({ text, tone, life: 2.4 });
    if (this.toasts.length > 3) this.toasts.shift();
  }

  say(speaker: string, line: string, durationMs: number): void {
    this.story = { speaker, line, life: durationMs / 1000, total: durationMs / 1000 };
  }

  clear(): void {
    this.toasts = [];
    this.story = null;
  }

  update(dt: number): void {
    for (let i = this.toasts.length - 1; i >= 0; i--) {
      const toast = this.toasts[i] as Toast;
      toast.life -= dt;
      if (toast.life <= 0) this.toasts.splice(i, 1);
    }
    if (this.story) {
      this.story.life -= dt;
      if (this.story.life <= 0) this.story = null;
    }
    this.countdownPulse += dt;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    race: Race,
    circuit: CircuitSpec,
    width: number,
    height: number,
    touchActive: boolean,
    fps: number,
    showFps: boolean,
  ): void {
    const player = race.player;
    const unit = Math.min(width, height * 1.7) / 100;

    this.drawSpeedo(ctx, player, width, height, unit);
    this.drawCondition(ctx, player, unit);
    this.drawStandings(ctx, race, circuit, width, unit);
    this.drawMinimap(ctx, race, width, height, unit);
    this.drawPolice(ctx, race, width, unit);
    this.drawToasts(ctx, width, height, unit);
    this.drawStory(ctx, width, height, unit);

    if (race.phase === 'countdown') this.drawCountdown(ctx, race, width, height, unit);
    if (touchActive) this.drawTouchControls(ctx, width, height);
    if (showFps) {
      ctx.fillStyle = fps < 45 ? BAD : withAlpha('#ffffff', 0.6);
      ctx.font = `${unit * 1.5}px ${MONO}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${fps} fps`, width - unit, height - unit);
    }
  }

  /** Bottom-left: the number that matters, plus a rev arc. */
  private drawSpeedo(
    ctx: CanvasRenderingContext2D,
    player: Racer,
    width: number,
    height: number,
    unit: number,
  ): void {
    const cx = unit * 11;
    const cy = height - unit * 10;
    const r = unit * 8;
    const percent = clamp(player.speedPercent, 0, 1.2);

    ctx.save();
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.78, Math.PI * 2.22);
    ctx.strokeStyle = withAlpha(INK, 0.6);
    ctx.lineWidth = unit * 1.5;
    ctx.stroke();

    // The needle arc goes amber then red as the engine runs out of revs.
    const sweep = Math.PI * 0.78 + percent * Math.PI * 1.44;
    ctx.beginPath();
    ctx.arc(cx, cy, r, Math.PI * 0.78, sweep);
    ctx.strokeStyle = percent > 0.95 ? BAD : percent > 0.78 ? WARN : GOOD;
    ctx.lineWidth = unit * 1.3;
    ctx.stroke();

    if (player.boost > 0) {
      ctx.beginPath();
      ctx.arc(cx, cy, r + unit * 1.4, Math.PI * 0.78, Math.PI * 2.22);
      ctx.strokeStyle = withAlpha('#ffd28a', 0.55 + Math.sin(this.countdownPulse * 14) * 0.3);
      ctx.lineWidth = unit * 0.5;
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.fillStyle = '#f2f4f7';
    ctx.font = `700 ${unit * 6}px ${FONT}`;
    ctx.fillText(`${toKmh(player.speed)}`, cx, cy + unit * 1.6);
    ctx.font = `600 ${unit * 1.7}px ${FONT}`;
    ctx.fillStyle = withAlpha('#f2f4f7', 0.6);
    ctx.fillText('KM/H', cx, cy + unit * 4.2);

    // Gear indicator, derived from where you are in the rev range.
    const gear = Math.max(1, Math.min(player.bike.gears, Math.ceil(percent * player.bike.gears)));
    ctx.font = `700 ${unit * 2.2}px ${MONO}`;
    ctx.fillStyle = withAlpha('#f2f4f7', 0.85);
    ctx.fillText(`${gear}`, cx + r * 0.82, cy - r * 0.5);
    ctx.restore();
    void width;
  }

  /** Bike damage and rider condition, stacked above the speedo. */
  private drawCondition(ctx: CanvasRenderingContext2D, player: Racer, unit: number): void {
    const x = unit * 3;
    const y = unit * 3;
    const w = unit * 22;
    const h = unit * 1.9;

    const bar = (dy: number, value: number, label: string, good: string) => {
      ctx.fillStyle = withAlpha(INK, 0.55);
      ctx.fillRect(x, y + dy, w, h);
      const fill = clamp(value / 100, 0, 1);
      ctx.fillStyle = fill > 0.55 ? good : fill > 0.25 ? WARN : BAD;
      ctx.fillRect(x, y + dy, w * fill, h);
      ctx.fillStyle = withAlpha('#ffffff', 0.9);
      ctx.font = `700 ${unit * 1.2}px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + unit * 0.6, y + dy + h * 0.72);
    };

    bar(0, 100 - player.bikeDamage, 'BIKE', GOOD);
    bar(h + unit * 0.7, player.riderHealth, 'RIDER', GOOD);
    bar((h + unit * 0.7) * 2, player.stamina, 'STAMINA', '#5aa8e8');

    if (player.weapon) {
      const wy = y + (h + unit * 0.7) * 3 + unit * 0.4;
      ctx.fillStyle = withAlpha('#f0a828', 0.9);
      ctx.fillRect(x, wy, unit * 11, h);
      ctx.fillStyle = INK;
      ctx.font = `700 ${unit * 1.2}px ${FONT}`;
      ctx.fillText(`${player.weapon.toUpperCase()}  x${player.weaponUses}`, x + unit * 0.6, wy + h * 0.72);
    }
  }

  /** Top-right: position, lap and clock. */
  private drawStandings(
    ctx: CanvasRenderingContext2D,
    race: Race,
    circuit: CircuitSpec,
    width: number,
    unit: number,
  ): void {
    const x = width - unit * 3;
    ctx.textAlign = 'right';

    ctx.fillStyle = '#f2f4f7';
    ctx.font = `700 ${unit * 6.5}px ${FONT}`;
    ctx.fillText(ordinal(race.player.place), x, unit * 8);

    ctx.font = `600 ${unit * 2}px ${FONT}`;
    ctx.fillStyle = withAlpha('#f2f4f7', 0.75);
    ctx.fillText(`of ${race.racers.length}`, x, unit * 10.6);

    ctx.font = `700 ${unit * 2.4}px ${MONO}`;
    ctx.fillStyle = '#f2f4f7';
    ctx.fillText(formatTime(race.elapsed), x, unit * 14);

    ctx.font = `600 ${unit * 1.9}px ${FONT}`;
    ctx.fillStyle = withAlpha('#f2f4f7', 0.7);
    ctx.fillText(`LAP ${Math.min(race.player.lap + 1, race.laps)} / ${race.laps}`, x, unit * 17);
    ctx.font = `500 ${unit * 1.5}px ${FONT}`;
    ctx.fillStyle = withAlpha('#f2f4f7', 0.45);
    ctx.fillText(circuit.name.toUpperCase(), x, unit * 19.4);
  }

  /**
   * Top-centre strip showing who is near you on the road.
   * Far more useful than a track map at these speeds — what you need to know is
   * whether the person about to kick you is on your left or your right.
   */
  private drawMinimap(
    ctx: CanvasRenderingContext2D,
    race: Race,
    width: number,
    height: number,
    unit: number,
  ): void {
    const w = unit * 30;
    const h = unit * 3.2;
    const x = width / 2 - w / 2;
    const y = unit * 2.4;
    const range = 5000;

    ctx.fillStyle = withAlpha(INK, 0.45);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = withAlpha('#ffffff', 0.14);
    ctx.fillRect(x + w / 2 - 1, y, 2, h);

    for (const racer of race.racers) {
      if (racer === race.player) continue;
      let dz = racer.z - race.player.z;
      const len = race.road.length;
      if (dz > len / 2) dz -= len;
      if (dz < -len / 2) dz += len;
      if (Math.abs(dz) > range) continue;

      const px = x + w / 2 + (dz / range) * (w / 2);
      const py = y + h / 2 + clamp(racer.x, -1.4, 1.4) * (h / 2.8);
      ctx.fillStyle = racer.isDown ? withAlpha('#7a828c', 0.8) : BAD;
      ctx.fillRect(px - unit * 0.35, py - unit * 0.35, unit * 0.7, unit * 0.7);
    }

    const py = y + h / 2 + clamp(race.player.x, -1.4, 1.4) * (h / 2.8);
    ctx.fillStyle = GOOD;
    ctx.fillRect(x + w / 2 - unit * 0.45, py - unit * 0.45, unit * 0.9, unit * 0.9);
    void height;
  }

  private drawPolice(
    ctx: CanvasRenderingContext2D,
    race: Race,
    width: number,
    unit: number,
  ): void {
    const level = race.police.level;
    if (level <= 0) return;
    const flash = Math.sin(this.countdownPulse * 9) > 0;
    ctx.textAlign = 'center';
    ctx.font = `700 ${unit * 2}px ${FONT}`;
    ctx.fillStyle = flash ? '#5aa8e8' : BAD;
    ctx.fillText('POLICE', width / 2, unit * 9);
    for (let i = 0; i < level; i++) {
      ctx.fillStyle = flash ? BAD : '#5aa8e8';
      ctx.fillRect(width / 2 - unit * 3 + i * unit * 2.4, unit * 10.2, unit * 1.8, unit * 0.8);
    }
  }

  private drawToasts(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    unit: number,
  ): void {
    ctx.textAlign = 'center';
    this.toasts.forEach((toast, i) => {
      const alpha = clamp(toast.life / 0.6, 0, 1);
      const y = height * 0.30 + i * unit * 4;
      ctx.font = `700 ${unit * 3.2}px ${FONT}`;
      ctx.fillStyle = withAlpha(
        toast.tone === 'good' ? GOOD : toast.tone === 'bad' ? BAD : '#f2f4f7',
        alpha,
      );
      ctx.fillText(toast.text, width / 2, y);
    });
  }

  /** Story beats for the rickshaw campaign, in a subtitle band. */
  private drawStory(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    unit: number,
  ): void {
    if (!this.story) return;
    const fade = clamp(Math.min(this.story.life, this.story.total - this.story.life) / 0.35, 0, 1);
    const boxH = unit * 9;
    const y = height - boxH - unit * 2;

    ctx.fillStyle = withAlpha(INK, 0.72 * fade);
    ctx.fillRect(width * 0.24, y, width * 0.52, boxH);
    ctx.fillStyle = withAlpha(WARN, 0.9 * fade);
    ctx.fillRect(width * 0.24, y, unit * 0.5, boxH);

    ctx.textAlign = 'left';
    ctx.font = `700 ${unit * 1.7}px ${FONT}`;
    ctx.fillStyle = withAlpha(WARN, fade);
    ctx.fillText(this.story.speaker.toUpperCase(), width * 0.24 + unit * 1.6, y + unit * 2.8);

    ctx.font = `500 ${unit * 2.1}px ${FONT}`;
    ctx.fillStyle = withAlpha('#f2f4f7', fade);
    this.wrap(ctx, this.story.line, width * 0.24 + unit * 1.6, y + unit * 5.4, width * 0.48, unit * 2.6);
  }

  private wrap(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number,
  ): void {
    const words = text.split(' ');
    let line = '';
    let cursor = y;
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (ctx.measureText(candidate).width > maxWidth && line) {
        ctx.fillText(line, x, cursor);
        line = word;
        cursor += lineHeight;
      } else {
        line = candidate;
      }
    }
    if (line) ctx.fillText(line, x, cursor);
  }

  private drawCountdown(
    ctx: CanvasRenderingContext2D,
    race: Race,
    width: number,
    height: number,
    unit: number,
  ): void {
    const count = Math.ceil(race.countdown);
    const fraction = race.countdown - Math.floor(race.countdown);
    const scale = 1 + (1 - fraction) * 0.5;
    const label = count > 0 ? `${count}` : 'GO';

    ctx.save();
    ctx.textAlign = 'center';
    ctx.translate(width / 2, height * 0.42);
    ctx.scale(scale, scale);
    ctx.font = `700 ${unit * 12}px ${FONT}`;
    ctx.fillStyle = withAlpha(count > 0 ? '#f2f4f7' : GOOD, clamp(fraction * 1.6, 0.2, 1));
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  /** Thumb controls. Drawn by the HUD so the layout and the hit test share one source. */
  private drawTouchControls(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
  ): void {
    ctx.save();
    for (const zone of TOUCH_ZONES) {
      const x = zone.x * width;
      const y = zone.y * height;
      const w = zone.w * width;
      const h = zone.h * height;
      const r = Math.min(w, h) * 0.32;

      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = withAlpha('#f2f4f7', 0.10);
      ctx.fill();
      ctx.strokeStyle = withAlpha('#f2f4f7', 0.28);
      ctx.lineWidth = Math.max(1, width * 0.002);
      ctx.stroke();

      ctx.fillStyle = withAlpha('#f2f4f7', 0.72);
      ctx.font = `700 ${Math.min(w, h) * 0.34}px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(zone.label, x + w / 2, y + h / 2);
    }
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
  }
}
