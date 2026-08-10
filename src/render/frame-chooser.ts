import { clamp } from '../core/math.ts';
import type { Racer } from '../game/racer.ts';
import { attackPhase } from '../game/racer.ts';
import { shortPlate } from '../data/plates.ts';
import type { BikeFrameOptions } from './sprites/bike.ts';

/**
 * Chooses which baked sprite frame a rider should be drawn in.
 *
 * Pulled out of the renderer because it is pose logic, not drawing: it reads
 * simulation state — lean, swing phase, how far through a spill — and answers
 * with the frame the atlas already rasterised. The renderer's job is the
 * segment loop; this is the bit that decides what a rider looks like.
 */
export class FrameChooser {
  /** Local registration mark for this circuit, stamped on every machine. */
  private plate: string | undefined;
  private city = 'bengaluru';

  setRegion(plate: string, city: string): void {
    this.plate = plate;
    this.city = city;
  }

  frameFor(racer: Racer): BikeFrameOptions {
    const lean = clamp(Math.round(racer.lean * 2), -2, 2);
    let action: 0 | 1 | 2 | 3 = 0;
    let side: -1 | 1 = 1;
    if (racer.attack) {
      // Anticipation gets its own cocked-arm pose; the strike and the
      // follow-through share the extended one.
      action = attackPhase(racer) === 'windup' ? 3 : racer.attack.kind === 'punch' ? 1 : 2;
      side = racer.attack.direction >= 0 ? 1 : -1;
    }
    return {
      // A rider mid-swing is still cornering. Zeroing the lean snapped the bike
      // bolt upright the instant you pressed a button, which read as a glitch.
      lean: racer.attack ? clamp(Math.round(racer.lean), -1, 1) : lean,
      action,
      actionSide: side,
      down: racer.isDown,
      downStage: this.downStage(racer),
      lamp: racer.speed < racer.handling.maxSpeed * 0.4 ? 1 : 0,
      // Rivals each get their own district so a pack is not twelve identical
      // registrations; the warm-up rasterised exactly these.
      plate: racer.kind === 'player'
        ? this.plate
        : this.plate ? shortPlate(this.city, racer.id) : undefined,
    };
  }

  /**
   * Which beat of the spill a rider is on.
   *
   * Weighted toward the middle: the tumble is over in a moment, the sprawl and
   * the pick-up are what you actually watch, and the run back has to finish
   * just before the remount so the rider is not still jogging when the bike
   * pulls away.
   */
  private downStage(racer: Racer): 0 | 1 | 2 | 3 {
    if (!racer.isDown) return 0;
    const t = racer.downProgress;
    if (t < 0.16) return 0;
    if (t < 0.44) return 1;
    if (t < 0.70) return 2;
    return 3;
  }
}
