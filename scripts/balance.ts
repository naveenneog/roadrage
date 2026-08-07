import { Rng } from '../src/core/rng.ts';
import { getBike } from '../src/data/bikes.ts';
import { CIRCUITS, getCircuit } from '../src/data/circuits.ts';
import { think, tierForDifficulty } from '../src/game/ai.ts';
import { Race } from '../src/game/race.ts';
import { Racer } from '../src/game/racer.ts';

/**
 * Balance harness. Runs every circuit with a competent driver at the controls —
 * the same `think()` the rivals use — and reports whether the race is winnable,
 * how long it takes, and what actually hurt.
 *
 * Run: npx vite-node scripts/balance.ts [circuitId] [bikeId]
 */
const STEP = 1 / 120;

const runOne = (circuitId: string, bikeId: string) => {
  const circuit = getCircuit(circuitId);
  const race = new Race({
    circuit,
    playerBike: getBike(bikeId),
    rivalCount: 5,
    seed: `balance:${circuitId}:${bikeId}`,
  });

  // Drive the player with the same brain as the rivals, one tier above the field,
  // so the result reflects the circuit rather than a bad bot.
  const tier = tierForDifficulty(Math.min(5, circuit.difficulty + 1));
  const shadow = new Racer(-1, 'rival', 'shadow', getBike(bikeId), tier);
  const rng = new Rng(`driver:${circuitId}`);

  let downs = 0;
  let wasDown = false;
  let peakDamage = 0;

  race.start();
  const limit = Math.round(600 / STEP);
  for (let i = 0; i < limit && !race.finished; i++) {
    // Mirror live player state into the shadow so `think` plans from reality.
    shadow.z = race.player.z;
    shadow.x = race.player.x;
    shadow.speed = race.player.speed;
    shadow.lean = race.player.lean;
    shadow.stamina = race.player.stamina;
    shadow.weapon = race.player.weapon;
    shadow.downTimer = race.player.downTimer;
    shadow.attack = race.player.attack;

    const controls = think(shadow, race.road, race.racers, race.player, STEP, rng, race.traffic);
    race.update(STEP, { ...controls, punch: false, kick: i % 300 === 0 });

    if (race.player.isDown && !wasDown) downs++;
    wasDown = race.player.isDown;
    peakDamage = Math.max(peakDamage, race.player.bikeDamage);
  }

  const p = race.player;
  const laps = `${p.lap}/${race.laps}`;
  return {
    circuit: circuitId,
    bike: bikeId,
    phase: race.phase,
    seconds: race.elapsed,
    laps,
    place: p.place,
    damage: peakDamage,
    health: p.riderHealth,
    downs,
    lapSeconds: p.lap > 0 ? race.elapsed / p.lap : race.elapsed,
  };
};

const pairs: Array<[string, string]> = CIRCUITS.map((c) => {
  // Give the player a bike appropriate to the tier of the event.
  const bike = ['splendor', 'rx100', 'pulsar220', 'apache200', 'ns200', 'roadster', 'rd350', 'duke390', 'interceptor'][
    Math.min(8, c.difficulty + 3)
  ] as string;
  return [c.id, bike];
});

const only = process.argv[2];
const chosen = only ? pairs.filter(([c]) => c === only) : pairs;

console.log(
  'circuit'.padEnd(16), 'bike'.padEnd(12), 'result'.padEnd(9),
  'time'.padStart(7), 'laps'.padStart(5), 'pos'.padStart(4),
  'dmg'.padStart(5), 'hp'.padStart(5), 'downs'.padStart(6), 'lap-s'.padStart(7),
);
console.log('-'.repeat(90));

let failures = 0;
for (const [circuitId, bikeId] of chosen) {
  const r = runOne(circuitId, process.argv[3] ?? bikeId);
  if (r.phase !== 'finished') failures++;
  console.log(
    r.circuit.padEnd(16), r.bike.padEnd(12), r.phase.padEnd(9),
    `${r.seconds.toFixed(1)}s`.padStart(7), r.laps.padStart(5), `${r.place}`.padStart(4),
    r.damage.toFixed(0).padStart(5), r.health.toFixed(0).padStart(5),
    `${r.downs}`.padStart(6), `${r.lapSeconds.toFixed(1)}s`.padStart(7),
  );
}
console.log('-'.repeat(90));
console.log(failures === 0 ? 'All circuits completable.' : `${failures} circuit(s) not completed.`);
