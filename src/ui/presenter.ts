import type { EventBus, GameEvents } from '../core/events.ts';
import type { Hud } from '../render/hud.ts';
import type { Renderer } from '../render/renderer.ts';

export interface PresentationHooks {
  hud: Hud;
  renderer: Renderer;
  /** Where impacts should burst on screen — roughly where the player's bike is. */
  impactOrigin(): { x: number; y: number };
  onTakedown(): void;
  onFinish(payload: GameEvents['race:finish']): void;
}

/**
 * Translates simulation events into things the player can see.
 *
 * This is the one place that knows a takedown should flash the screen and a
 * pothole should not. Keeping it out of both the race and the app shell means
 * the simulation stays headless and `main.ts` stays a shell.
 */
export const attachPresentation = (
  events: EventBus<GameEvents>,
  hooks: PresentationHooks,
): (() => void) => {
  const offs: Array<() => void> = [];
  const on = <K extends keyof GameEvents>(
    key: K,
    handler: (payload: GameEvents[K]) => void,
  ) => {
    offs.push(events.on(key, handler));
  };

  on('ui:toast', ({ text, tone }) => hooks.hud.toast(text, tone));

  on('race:countdown', ({ count }) => {
    if (count <= 0) hooks.hud.toast('GO', 'good');
  });

  on('rider:down', ({ byPlayer }) => {
    if (!byPlayer) return;
    hooks.onTakedown();
    hooks.hud.toast('TAKEDOWN', 'good');
    hooks.renderer.punch('#ffffff', 0.35);
  });

  on('impact', ({ power, byPlayer, kind }) => {
    if (!byPlayer || power < 0.35) return;
    // Warm sparks for a landed blow, hot red for hitting something solid.
    const colour = kind === 'traffic' || kind === 'wall' ? '#e8543f' : '#ffd28a';
    const origin = hooks.impactOrigin();
    hooks.renderer.spawnImpact(origin.x, origin.y, power, colour);
    if (power > 0.7) hooks.renderer.punch(colour, power * 0.4);
  });

  on('weapon:pickup', ({ weapon }) => hooks.hud.toast(weapon.toUpperCase(), 'good'));

  // Other road users. `pan` is -1..1 across the road, so it maps onto the
  // screen rather than always appearing in the middle.
  on('taunt', ({ text, gloss, pan, hostile }) =>
    hooks.renderer.shouts.add(text, gloss, 0.5 + pan * 0.28, hostile));

  // The police indicator is persistent at the top of the screen, so a toast
  // saying the same word is just the HUD shouting twice.

  on('story:beat', ({ speaker, line, durationMs }) =>
    hooks.hud.say(speaker, line, durationMs));

  on('race:finish', (payload) => hooks.onFinish(payload));

  return () => {
    for (const off of offs) off();
    offs.length = 0;
  };
};
