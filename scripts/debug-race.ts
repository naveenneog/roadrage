import { getBike } from '../src/data/bikes.ts';
import { getCircuit } from '../src/data/circuits.ts';
import { Race } from '../src/game/race.ts';

const circuitId = process.argv[2] ?? 'talao-pali';
const bikeId = process.argv[3] ?? 'ns200';

const race = new Race({
  circuit: getCircuit(circuitId),
  playerBike: getBike(bikeId),
  rivalCount: 5,
  seed: 'deterministic-test',
});

const tally: Record<string, { count: number; damage: number }> = {};
let lastDamage = 0;
race.bus.on('impact', (p) => {
  if (!p.byPlayer) return;
  const delta = race.player.bikeDamage - lastDamage;
  const entry = (tally[p.kind] ??= { count: 0, damage: 0 });
  entry.count++;
  entry.damage += Math.max(0, delta);
  lastDamage = race.player.bikeDamage;
});

const clampTo = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const steerFor = () => {
  let nearest: { dz: number; x: number; width: number } | null = null;
  for (const v of race.traffic.vehicles) {
    if (!v.active) continue;
    let dz = v.z - race.player.z;
    if (dz < -race.road.length / 2) dz += race.road.length;
    if (dz < 0 || dz > 9000) continue;
    if (!nearest || dz < nearest.dz) nearest = { dz, x: v.x, width: v.spec.width };
  }
  if (nearest && Math.abs(nearest.x - race.player.x) < nearest.width + 0.3) {
    const away = nearest.x > 0 ? -1 : 1;
    const target = clampTo(nearest.x + away * (nearest.width + 0.45), -0.9, 0.9);
    return clampTo((target - race.player.x) * 3, -1, 1);
  }
  return clampTo(-race.player.x * 2.5, -1, 1);
};

race.start();
const STEP = 1 / 120;
console.log(`${circuitId} / ${bikeId}: road=${race.road.length} laps=${race.laps}`);
let downCount = 0;
let wasDown = false;
for (let i = 0; i < 400 / STEP && !race.finished; i++) {
  race.update(STEP, {
    throttle: 1, steer: steerFor(), brake: 0,
    punch: false, kick: i % 260 === 0, boost: false,
  });
  if (race.player.isDown && !wasDown) downCount++;
  wasDown = race.player.isDown;
  if (i % 2400 === 0) {
    const p = race.player;
    console.log(
      `t=${race.elapsed.toFixed(0).padStart(3)} lap=${p.lap} z=${p.z.toFixed(0).padStart(7)}`,
      `spd=${((p.speed / p.handling.maxSpeed) * 100).toFixed(0).padStart(3)}% dmg=${p.bikeDamage.toFixed(0).padStart(3)}`,
      `hp=${p.riderHealth.toFixed(0).padStart(3)} place=${p.place} downs=${downCount}`,
    );
  }
}
const p = race.player;
console.log(`END ${race.phase} t=${race.elapsed.toFixed(1)} lap=${p.lap}/${race.laps} dmg=${p.bikeDamage.toFixed(0)} hp=${p.riderHealth.toFixed(0)} downs=${downCount} place=${p.place}`);
console.log('impact tally:', JSON.stringify(tally));
console.log('rivals:', race.racers.filter((r) => r.kind === 'rival')
  .map((r) => `${r.name}:${r.place}/lap${r.lap}/dmg${r.bikeDamage.toFixed(0)}`).join(' '));
