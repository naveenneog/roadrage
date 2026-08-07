/**
 * Typed publish/subscribe. This is the seam that lets the simulation stay headless:
 * game code emits, audio and render subscribe. Nothing crosses the other way.
 */
export type Listener<T> = (payload: T) => void;

export class EventBus<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>();

  on<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(listener as Listener<never>);
    return () => this.off(event, listener);
  }

  once<K extends keyof Events>(event: K, listener: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  off<K extends keyof Events>(event: K, listener: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(listener as Listener<never>);
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    // Copy first: a listener that unsubscribes itself must not mutate the set mid-iteration.
    for (const listener of Array.from(set)) {
      (listener as Listener<Events[K]>)(payload);
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}

export interface ImpactEvent {
  kind: 'punch' | 'kick' | 'weapon' | 'shunt' | 'wall' | 'traffic' | 'block';
  /** 0..1 — drives volume, screenshake and hitstop length. */
  power: number;
  /** -1..1 screen-relative pan. */
  pan: number;
  byPlayer: boolean;
}

export interface GameEvents {
  'impact': ImpactEvent;
  'rider:down': { racerId: number; byPlayer: boolean; pan: number };
  'bike:crash': { racerId: number; speed: number };
  'race:start': { circuitId: string; laps: number };
  'race:countdown': { count: number };
  'race:finish': { position: number; timeSeconds: number; cash: number };
  'race:checkpoint': { index: number; bonusSeconds: number };
  'cop:spotted': { level: number };
  'cop:busted': Record<string, never>;
  'cop:evaded': Record<string, never>;
  'weapon:pickup': { weapon: string };
  'nitro': { active: boolean };
  'gear:shift': { gear: number; up: boolean };
  'story:beat': { id: string; speaker: string; line: string; durationMs: number };
  'fare:reaction': { line: string; mood: 'calm' | 'nervous' | 'terrified' | 'thrilled' };
  'ui:toast': { text: string; tone: 'good' | 'bad' | 'info' };
  'horn': { pan: number; kind: 'auto' | 'truck' | 'bike' };
}
