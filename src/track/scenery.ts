import { Rng } from '../core/rng.ts';
import type { Road, SceneryItem } from './road.ts';

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
const MIN_SPACING = 3;
const MAX_SPACING = 26;

/**
 * Scatter roadside scenery deterministically.
 *
 * Placement is seeded per circuit, so a track looks identical on every run and
 * can be learned — the banyan on the exit of turn three is always that banyan.
 * Landmarks placed by the track script are left untouched.
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

  const spacing = Math.max(
    MIN_SPACING,
    Math.round(MAX_SPACING - (MAX_SPACING - MIN_SPACING) * Math.min(1, Math.max(0, density))),
  );

  for (const side of [-1, 1] as const) {
    let index = rng.int(0, spacing);
    let layer = 0;
    while (index < road.segments.length) {
      const segment = road.segments[index];
      if (!segment) break;
      // Don't bury a scripted landmark under a chai stall.
      if (segment.scenery.length === 0) {
        const entry = pick();
        const offset = rng.range(entry.minOffset, entry.maxOffset) * side;
        const item: SceneryItem = {
          id: entry.id,
          offset,
          scale: (entry.scale ?? 1) * rng.range(0.86, 1.18),
          layer: layer % 3,
        };
        segment.scenery.push(item);
        layer++;
      }
      index += rng.int(Math.max(1, Math.floor(spacing * 0.5)), Math.floor(spacing * 1.6));
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
