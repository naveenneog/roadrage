import type { SaveData } from '../core/storage.ts';
import type { CircuitSpec } from '../data/types.ts';
import {
  applyCampaignResult, applyRaceResult, nextEvent, type ProgressChange,
} from '../game/career.ts';
import { CAMPAIGN_CHAPTERS, type CampaignChapter, type ResultsPayload } from './screens.ts';

export interface FinishInput {
  position: number;
  timeSeconds: number;
  cash: number;
}

export interface FinishContext {
  circuit: CircuitSpec;
  chapter?: CampaignChapter | undefined;
  wrecked: boolean;
  fieldSize: number;
  takedowns: number;
  damage: number;
  topSpeed: number;
  careerOrder: readonly string[];
  nameOf(circuitId: string): string;
}

/**
 * Turn a finished race into an updated save and a results screen.
 *
 * Pulled out of the app shell because it is decision-making, not plumbing:
 * which ladder applies, what the prize is, what unlocked. The shell then only
 * has to store the save and show the screen.
 */
export const buildFinish = (
  save: SaveData,
  input: FinishInput,
  ctx: FinishContext,
): { change: ProgressChange; results: ResultsPayload } => {
  const change: ProgressChange = ctx.chapter
    ? applyCampaignResult(
        save,
        {
          chapterIndex: CAMPAIGN_CHAPTERS.indexOf(ctx.chapter),
          survived: !ctx.wrecked,
          reward: ctx.chapter.reward,
        },
        CAMPAIGN_CHAPTERS.length,
        (i) => CAMPAIGN_CHAPTERS[i]?.title ?? '',
      )
    : applyRaceResult(
        save,
        {
          circuitId: ctx.circuit.id,
          position: input.position,
          timeSeconds: input.timeSeconds,
          wrecked: ctx.wrecked,
          takedowns: ctx.takedowns,
          prize: input.cash,
        },
        ctx.careerOrder,
        ctx.nameOf,
      );

  const results: ResultsPayload = {
    circuitName: ctx.circuit.name,
    position: input.position,
    fieldSize: ctx.fieldSize,
    timeSeconds: input.timeSeconds,
    cash: change.cash,
    takedowns: ctx.takedowns,
    damage: ctx.damage,
    topSpeed: ctx.topSpeed,
    wrecked: ctx.wrecked,
    best: change.personalBest,
    unlocked: change.unlocked,
    canContinue: !ctx.chapter
      && nextEvent(change.save, ctx.circuit.id, ctx.careerOrder) !== null,
  };

  return { change, results };
};
