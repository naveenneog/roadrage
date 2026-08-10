import type { BikeSpec, CircuitSpec, TrafficSpec } from '../data/types.ts';
import { shortPlate } from '../data/plates.ts';
import type { Road } from '../track/road.ts';
import { sceneryIds } from '../track/scenery.ts';
import type { Renderer } from './renderer.ts';

/**
 * Rasterise every sprite a race can possibly show, before the flag drops.
 *
 * The atlas builds sprites lazily, which is fine except that the first time a
 * banyan tree appears you would pay for forty bezier curves inside a frame
 * budget of sixteen milliseconds. Warming up front turns that into a one-off
 * cost during the countdown, where nobody can feel it.
 */
export const warmForRace = (
  renderer: Renderer,
  circuit: CircuitSpec,
  road: Road,
  playerBike: BikeSpec,
  fieldBikes: readonly BikeSpec[],
  traffic: readonly TrafficSpec[],
  livery?: { body: string; roof: string },
): void => {
  // Everything on this circuit wears the local registration mark.
  renderer.atlas.setCity(circuit.city);
  const plate = shortPlate(circuit.city, 0);
  renderer.setPlate(plate, circuit.city);
  // The player's machine gets hero-resolution frames plus its own spinnable
  // wheel; everyone else shares the smaller combined sprite.
  renderer.setPlayerLivery(livery);
  renderer.atlas.warmHero(playerBike, livery, plate);
  renderer.atlas.warmBike(playerBike, livery, plate);
  // Rivals share bike types often, and the atlas is keyed by id, so duplicates
  // cost a map lookup rather than a redraw.
  for (let i = 0; i < fieldBikes.length; i++) {
    renderer.atlas.warmBike(fieldBikes[i] as BikeSpec, undefined, shortPlate(circuit.city, i + 1));
  }
  renderer.atlas.warmCircuit(sceneryIds(road, circuit.scenery), traffic);
  renderer.prepare(circuit, road);
};
