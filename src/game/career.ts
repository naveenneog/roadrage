import type { SaveData } from '../core/storage.ts';
import type { BikeSpec, CircuitSpec } from '../data/types.ts';

/**
 * Career progression: entry, prizes, unlocks and the garage economy.
 *
 * Deliberately pure — every function takes a save and returns a new save plus a
 * description of what changed. That keeps the money maths out of the render
 * loop and makes "does winning actually unlock the next event?" a unit test
 * rather than a nine-race manual playthrough.
 */

export interface RaceOutcome {
  circuitId: string;
  position: number;
  timeSeconds: number;
  wrecked: boolean;
  takedowns: number;
  /** Prize as calculated by the race from the circuit purse. */
  prize: number;
}

export interface ProgressChange {
  save: SaveData;
  /** Cash actually awarded, after the wreck penalty. */
  cash: number;
  /** Name of anything newly unlocked, for the results screen. */
  unlocked: string | null;
  /** True when this run beat the stored best. */
  personalBest: boolean;
}

const clone = (save: SaveData): SaveData => ({
  ...save,
  ownedBikes: [...save.ownedBikes],
  unlockedCircuits: [...save.unlockedCircuits],
  bestTimes: { ...save.bestTimes },
  settings: { ...save.settings },
});

export const canAfford = (save: SaveData, circuit: CircuitSpec): boolean =>
  save.cash >= circuit.entryFee;

export const isUnlocked = (save: SaveData, circuitId: string): boolean =>
  save.unlockedCircuits.includes(circuitId);

export const canEnter = (save: SaveData, circuit: CircuitSpec): boolean =>
  isUnlocked(save, circuit.id) && canAfford(save, circuit);

/** Take the entry fee. Returns the save unchanged when it cannot be paid. */
export const payEntry = (save: SaveData, circuit: CircuitSpec): SaveData => {
  if (!canAfford(save, circuit)) return save;
  const next = clone(save);
  next.cash -= circuit.entryFee;
  return next;
};

/**
 * Fold a finished race into the save.
 *
 * A wreck pays nothing and unlocks nothing — the bike went home on a tempo.
 */
export const applyRaceResult = (
  save: SaveData,
  outcome: RaceOutcome,
  careerOrder: readonly string[],
  nameOf: (circuitId: string) => string,
): ProgressChange => {
  const next = clone(save);
  const won = outcome.position === 1 && !outcome.wrecked;
  const cash = outcome.wrecked ? 0 : outcome.prize;

  next.races++;
  next.takedowns += outcome.takedowns;
  if (won) next.wins++;
  next.cash += cash;

  let unlocked: string | null = null;
  if (won) {
    const index = careerOrder.indexOf(outcome.circuitId);
    const nextId = index >= 0 ? careerOrder[index + 1] : undefined;
    if (nextId && !next.unlockedCircuits.includes(nextId)) {
      next.unlockedCircuits.push(nextId);
      unlocked = nameOf(nextId);
    }
  }

  const previous = next.bestTimes[outcome.circuitId];
  const personalBest = !outcome.wrecked
    && (previous === undefined || outcome.timeSeconds < previous);
  if (personalBest) next.bestTimes[outcome.circuitId] = outcome.timeSeconds;

  return { save: next, cash, unlocked, personalBest };
};

export interface CampaignOutcome {
  chapterIndex: number;
  survived: boolean;
  reward: number;
}

/**
 * Campaign chapters pay for surviving rather than for winning. You are not
 * trying to beat the people behind you; you are trying to still be moving.
 */
export const applyCampaignResult = (
  save: SaveData,
  outcome: CampaignOutcome,
  totalChapters: number,
  titleOf: (index: number) => string,
): ProgressChange => {
  const next = clone(save);
  next.races++;
  const cash = outcome.survived ? outcome.reward : 0;
  next.cash += cash;

  let unlocked: string | null = null;
  if (outcome.survived
    && outcome.chapterIndex === next.storyChapter
    && outcome.chapterIndex + 1 < totalChapters) {
    next.storyChapter = outcome.chapterIndex + 1;
    unlocked = titleOf(next.storyChapter);
  }

  return { save: next, cash, unlocked, personalBest: false };
};

export interface PurchaseResult {
  save: SaveData;
  bought: boolean;
  reason: 'ok' | 'already-owned' | 'too-expensive';
}

export const purchase = (save: SaveData, bike: BikeSpec): PurchaseResult => {
  if (save.ownedBikes.includes(bike.id)) {
    return { save, bought: false, reason: 'already-owned' };
  }
  if (save.cash < bike.price) {
    return { save, bought: false, reason: 'too-expensive' };
  }
  const next = clone(save);
  next.cash -= bike.price;
  next.ownedBikes.push(bike.id);
  next.currentBike = bike.id;
  return { save: next, bought: true, reason: 'ok' };
};

export const selectBike = (save: SaveData, bikeId: string): SaveData => {
  if (!save.ownedBikes.includes(bikeId)) return save;
  const next = clone(save);
  next.currentBike = bikeId;
  return next;
};

/** The next event in the career, or null at the end of the ladder. */
export const nextEvent = (
  save: SaveData,
  currentId: string,
  careerOrder: readonly string[],
): string | null => {
  const index = careerOrder.indexOf(currentId);
  if (index < 0) return null;
  const nextId = careerOrder[index + 1];
  return nextId && save.unlockedCircuits.includes(nextId) ? nextId : null;
};
