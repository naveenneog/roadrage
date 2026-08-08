import { Rng } from '../core/rng.ts';
import type { Road } from './road.ts';

/**
 * Structural shape of a circuit's scenery mix. Declared here rather than
 * imported from `data/` so the track layer keeps its single dependency on core.
 */
export interface SceneryEntry {
  id: string;
  weight: number;
  minOffset: number;
  maxOffset: number;
  scale?: number;
}

/** How many segments apart scenery can be placed on one side, at density 1. */
const MIN_SPACING = 4;
const MAX_SPACING = 16;
/** Props per placement, so a roadside reads as a row of buildings not a picket fence. */
const MAX_LAYERS = 2;

/**
 * Scatter roadside scenery deterministically.
 *
 * Placement is seeded per circuit, so a track looks identical on every run and
 * can be learned — the banyan on the exit of turn three is always that banyan.
 * Landmarks placed by the track script are left untouched.
 *
 * Props are placed in depth layers: a near rank hugging the kerb, then ranks
 * set further back. A single rank at a single distance is what makes a
 * procedural roadside look like wallpaper.
 */
export const populateScenery = (
  road: Road,
  mix: readonly SceneryEntry[],
  density: number,
  seed: string,
): void => {
  if (mix.length === 0) return;
  const rng = new Rng(`scenery:${seed}`);
  const totalWeight = mix.reduce((sum, entry) => sum + entry.weight, 0);
  if (totalWeight <= 0) return;

  const pick = (): SceneryEntry => {
    let roll = rng.next() * totalWeight;
    for (const entry of mix) {
      roll -= entry.weight;
      if (roll <= 0) return entry;
    }
    return mix[0] as SceneryEntry;
  };

  const clamped = Math.min(1, Math.max(0, density));
  const spacing = Math.max(
    MIN_SPACING,
    Math.round(MAX_SPACING - (MAX_SPACING - MIN_SPACING) * clamped),
  );

  for (const side of [-1, 1] as const) {
    let index = rng.int(0, spacing);
    let layer = 0;
    while (index < road.segments.length) {
      const segment = road.segments[index];
      if (!segment) break;
      // Don't bury a scripted landmark under a chai stall.
      if (segment.scenery.length === 0) {
        // Two or three props on the same segment, set at different distances,
        // so the roadside has depth instead of being one flat rank.
        const ranks = 1 + rng.int(0, clamped > 0.7 ? MAX_LAYERS - 1 : 1);
        for (let r = 0; r < ranks; r++) {
          const entry = pick();
          const spread = entry.maxOffset - entry.minOffset;
          // Rank 0 hugs the kerb; later ranks sit progressively further back.
          const base = entry.minOffset + (r / MAX_LAYERS) * spread;
          const offset = rng.range(base, base + spread / MAX_LAYERS) * side;
          segment.scenery.push({
            id: entry.id,
            offset,
            scale: (entry.scale ?? 1) * rng.range(0.82, 1.24),
            layer: (layer + r) % 3,
          });
        }
        layer++;
      }
      index += rng.int(Math.max(1, Math.floor(spacing * 0.5)), Math.max(2, Math.floor(spacing * 1.5)));
    }
  }
};

/** Every prop id a circuit can produce, for atlas warm-up. */
export const sceneryIds = (road: Road, mix: readonly SceneryEntry[]): string[] => {
  const ids = new Set<string>(mix.map((entry) => entry.id));
  for (const segment of road.segments) {
    for (const item of segment.scenery) ids.add(item.id);
  }
  return Array.from(ids);
};
