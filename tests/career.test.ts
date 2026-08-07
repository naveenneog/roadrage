import { describe, expect, it } from 'vitest';
import { defaultSave, type SaveData } from '../src/core/storage.ts';
import { getBike } from '../src/data/bikes.ts';
import { CAREER_ORDER, getCircuit } from '../src/data/circuits.ts';
import {
  applyCampaignResult, applyRaceResult, canAfford, canEnter, isUnlocked,
  nextEvent, payEntry, purchase, selectBike,
} from '../src/game/career.ts';
import { engineBroadcast, musicIntensity, MAX_RIVAL_VOICES } from '../src/game/broadcast.ts';
import { Race } from '../src/game/race.ts';

const nameOf = (id: string) => getCircuit(id).name;
const rich = (): SaveData => ({ ...defaultSave(), cash: 1_000_000 });

describe('entry requirements', () => {
  it('the first circuit is unlocked and free', () => {
    const save = defaultSave();
    const first = getCircuit(CAREER_ORDER[0] as string);
    expect(isUnlocked(save, first.id)).toBe(true);
    expect(canEnter(save, first)).toBe(true);
    expect(first.entryFee).toBe(0);
  });

  it('later circuits are locked at the start', () => {
    const save = defaultSave();
    expect(canEnter(save, getCircuit('malshej'))).toBe(false);
  });

  it('an unlocked circuit you cannot afford is still refused', () => {
    const save = { ...defaultSave(), cash: 0, unlockedCircuits: ['shivajinagar', 'sb-road'] };
    expect(isUnlocked(save, 'sb-road')).toBe(true);
    expect(canAfford(save, getCircuit('sb-road'))).toBe(false);
    expect(canEnter(save, getCircuit('sb-road'))).toBe(false);
  });

  it('paying entry deducts exactly the fee and does not mutate the original', () => {
    const save = rich();
    const circuit = getCircuit('marine-drive');
    const after = payEntry(save, circuit);
    expect(after.cash).toBe(save.cash - circuit.entryFee);
    expect(save.cash).toBe(1_000_000);
  });

  it('paying an entry you cannot afford is a no-op', () => {
    const save = { ...defaultSave(), cash: 10 };
    const after = payEntry(save, getCircuit('marine-drive'));
    expect(after).toBe(save);
  });
});

describe('race results', () => {
  const win = (save: SaveData, circuitId: string) =>
    applyRaceResult(save, {
      circuitId, position: 1, timeSeconds: 100, wrecked: false, takedowns: 2, prize: 18000,
    }, CAREER_ORDER, nameOf);

  it('winning pays the prize and unlocks the next event', () => {
    const change = win(defaultSave(), 'shivajinagar');
    expect(change.cash).toBe(18000);
    expect(change.unlocked).toBe(getCircuit(CAREER_ORDER[1] as string).name);
    expect(change.save.unlockedCircuits).toContain(CAREER_ORDER[1]);
    expect(change.save.wins).toBe(1);
    expect(change.save.races).toBe(1);
    expect(change.save.takedowns).toBe(2);
  });

  it('does not mutate the save it was given', () => {
    const save = defaultSave();
    win(save, 'shivajinagar');
    expect(save.wins).toBe(0);
    expect(save.unlockedCircuits).toEqual(['shivajinagar']);
  });

  it('unlocking twice does not duplicate the entry', () => {
    const first = win(defaultSave(), 'shivajinagar');
    const second = win(first.save, 'shivajinagar');
    expect(second.unlocked).toBeNull();
    const count = second.save.unlockedCircuits.filter((id) => id === CAREER_ORDER[1]).length;
    expect(count).toBe(1);
  });

  it('a wreck pays nothing, unlocks nothing and sets no best time', () => {
    const change = applyRaceResult(defaultSave(), {
      circuitId: 'shivajinagar', position: 1, timeSeconds: 60,
      wrecked: true, takedowns: 0, prize: 18000,
    }, CAREER_ORDER, nameOf);
    expect(change.cash).toBe(0);
    expect(change.unlocked).toBeNull();
    expect(change.personalBest).toBe(false);
    expect(change.save.bestTimes.shivajinagar).toBeUndefined();
    expect(change.save.wins).toBe(0);
    // It still counts as a race attempted.
    expect(change.save.races).toBe(1);
  });

  it('second place pays but does not unlock', () => {
    const change = applyRaceResult(defaultSave(), {
      circuitId: 'shivajinagar', position: 2, timeSeconds: 90,
      wrecked: false, takedowns: 0, prize: 9900,
    }, CAREER_ORDER, nameOf);
    expect(change.cash).toBe(9900);
    expect(change.unlocked).toBeNull();
    expect(change.save.wins).toBe(0);
  });

  it('records a personal best only when the time actually improves', () => {
    const first = applyRaceResult(defaultSave(), {
      circuitId: 'shivajinagar', position: 3, timeSeconds: 120,
      wrecked: false, takedowns: 0, prize: 0,
    }, CAREER_ORDER, nameOf);
    expect(first.personalBest).toBe(true);
    expect(first.save.bestTimes.shivajinagar).toBe(120);

    const slower = applyRaceResult(first.save, {
      circuitId: 'shivajinagar', position: 3, timeSeconds: 140,
      wrecked: false, takedowns: 0, prize: 0,
    }, CAREER_ORDER, nameOf);
    expect(slower.personalBest).toBe(false);
    expect(slower.save.bestTimes.shivajinagar).toBe(120);

    const faster = applyRaceResult(slower.save, {
      circuitId: 'shivajinagar', position: 3, timeSeconds: 95,
      wrecked: false, takedowns: 0, prize: 0,
    }, CAREER_ORDER, nameOf);
    expect(faster.personalBest).toBe(true);
    expect(faster.save.bestTimes.shivajinagar).toBe(95);
  });

  it('winning the final event unlocks nothing and does not crash', () => {
    const last = CAREER_ORDER[CAREER_ORDER.length - 1] as string;
    const change = win(defaultSave(), last);
    expect(change.unlocked).toBeNull();
  });

  it('the whole ladder can be walked by winning each event in turn', () => {
    let save = defaultSave();
    for (const id of CAREER_ORDER) {
      expect(isUnlocked(save, id), id).toBe(true);
      save = win(save, id).save;
    }
    expect(save.unlockedCircuits.length).toBe(CAREER_ORDER.length);
    expect(save.wins).toBe(CAREER_ORDER.length);
  });
});

describe('campaign progression', () => {
  const title = (i: number) => `Chapter ${i + 1}`;

  it('surviving pays the reward and opens the next chapter', () => {
    const change = applyCampaignResult(defaultSave(),
      { chapterIndex: 0, survived: true, reward: 30000 }, 6, title);
    expect(change.cash).toBe(30000);
    expect(change.save.storyChapter).toBe(1);
    expect(change.unlocked).toBe('Chapter 2');
  });

  it('being wrecked pays nothing and does not advance the story', () => {
    const change = applyCampaignResult(defaultSave(),
      { chapterIndex: 0, survived: false, reward: 30000 }, 6, title);
    expect(change.cash).toBe(0);
    expect(change.save.storyChapter).toBe(0);
    expect(change.unlocked).toBeNull();
  });

  it('replaying an earlier chapter pays again but does not rewind progress', () => {
    const save = { ...defaultSave(), storyChapter: 3 };
    const change = applyCampaignResult(save,
      { chapterIndex: 0, survived: true, reward: 30000 }, 6, title);
    expect(change.cash).toBe(30000);
    expect(change.save.storyChapter).toBe(3);
    expect(change.unlocked).toBeNull();
  });

  it('finishing the last chapter does not run off the end', () => {
    const save = { ...defaultSave(), storyChapter: 5 };
    const change = applyCampaignResult(save,
      { chapterIndex: 5, survived: true, reward: 200000 }, 6, title);
    expect(change.save.storyChapter).toBe(5);
    expect(change.unlocked).toBeNull();
  });
});

describe('the garage', () => {
  it('buying deducts the price, adds the bike and selects it', () => {
    const save = rich();
    const bike = getBike('duke390');
    const result = purchase(save, bike);
    expect(result.bought).toBe(true);
    expect(result.save.cash).toBe(save.cash - bike.price);
    expect(result.save.ownedBikes).toContain('duke390');
    expect(result.save.currentBike).toBe('duke390');
  });

  it('refuses a bike you cannot afford, leaving the save untouched', () => {
    const save = { ...defaultSave(), cash: 100 };
    const result = purchase(save, getBike('interceptor'));
    expect(result.bought).toBe(false);
    expect(result.reason).toBe('too-expensive');
    expect(result.save).toBe(save);
  });

  it('refuses to charge twice for a bike you already own', () => {
    const save = rich();
    const first = purchase(save, getBike('rx100'));
    const second = purchase(first.save, getBike('rx100'));
    expect(second.bought).toBe(false);
    expect(second.reason).toBe('already-owned');
    expect(second.save.cash).toBe(first.save.cash);
  });

  it('selecting a bike you do not own is refused', () => {
    const save = defaultSave();
    expect(selectBike(save, 'duke390')).toBe(save);
    expect(save.currentBike).toBe('splendor');
  });
});

describe('next event', () => {
  it('returns the next unlocked circuit', () => {
    const save = { ...defaultSave(), unlockedCircuits: [...CAREER_ORDER] };
    expect(nextEvent(save, CAREER_ORDER[0] as string, CAREER_ORDER)).toBe(CAREER_ORDER[1]);
  });

  it('returns null when the next circuit is still locked', () => {
    expect(nextEvent(defaultSave(), CAREER_ORDER[0] as string, CAREER_ORDER)).toBeNull();
  });

  it('returns null at the end of the ladder and for unknown circuits', () => {
    const save = { ...defaultSave(), unlockedCircuits: [...CAREER_ORDER] };
    const last = CAREER_ORDER[CAREER_ORDER.length - 1] as string;
    expect(nextEvent(save, last, CAREER_ORDER)).toBeNull();
    expect(nextEvent(save, 'nowhere', CAREER_ORDER)).toBeNull();
  });
});

describe('presentation broadcast', () => {
  const makeRace = () => new Race({
    circuit: getCircuit('talao-pali'),
    playerBike: getBike('ns200'),
    rivalCount: 5,
    seed: 'broadcast-test',
  });

  it('always includes the player first, dry and centred', () => {
    const race = makeRace();
    const targets = engineBroadcast(race, 0.6);
    expect(targets[0]?.id).toBe(race.player.id);
    expect(targets[0]?.pan).toBe(0);
    expect(targets[0]?.distance).toBe(0);
    expect(targets[0]?.throttle).toBe(0.6);
  });

  it('never exceeds the voice budget', () => {
    const race = makeRace();
    const targets = engineBroadcast(race, 1);
    expect(targets.length).toBeLessThanOrEqual(MAX_RIVAL_VOICES + 1);
  });

  it('reuses the buffer it is given rather than allocating each frame', () => {
    const race = makeRace();
    const buffer = engineBroadcast(race, 1);
    const again = engineBroadcast(race, 1, buffer);
    expect(again).toBe(buffer);
  });

  it('pans rivals to the side they are actually on', () => {
    const race = makeRace();
    const rival = race.racers.find((r) => r !== race.player);
    expect(rival).toBeDefined();
    if (!rival) return;
    rival.z = race.player.z + 200;
    rival.x = race.player.x + 1;
    const right = engineBroadcast(race, 1).find((t) => t.id === rival.id);
    expect(right?.pan).toBeGreaterThan(0);

    rival.x = race.player.x - 1;
    const left = engineBroadcast(race, 1).find((t) => t.id === rival.id);
    expect(left?.pan).toBeLessThan(0);
  });

  it('drops rivals that are out of earshot', () => {
    const race = makeRace();
    for (const racer of race.racers) {
      if (racer !== race.player) racer.z = race.player.z + race.road.length / 2;
    }
    expect(engineBroadcast(race, 1).length).toBe(1);
  });

  it('music intensity stays inside 0..1 and rises when a rival is close', () => {
    const race = makeRace();
    for (const racer of race.racers) {
      if (racer !== race.player) racer.z = race.player.z + race.road.length / 2;
    }
    const alone = musicIntensity(race);

    const rival = race.racers.find((r) => r !== race.player);
    if (rival) rival.z = race.player.z + 100;
    const crowded = musicIntensity(race);

    expect(crowded).toBeGreaterThan(alone);
    for (const value of [alone, crowded]) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });
});
