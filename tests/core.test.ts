import { describe, expect, it, vi } from 'vitest';
import { Rng } from '../src/core/rng.ts';
import { EventBus, type GameEvents } from '../src/core/events.ts';
import { clearSave, defaultSave, loadSave, writeSave, type SaveData } from '../src/core/storage.ts';

describe('seeded random', () => {
  it('the same seed produces the same sequence', () => {
    const a = new Rng('shivajinagar');
    const b = new Rng('shivajinagar');
    const seqA = Array.from({ length: 20 }, () => a.next());
    const seqB = Array.from({ length: 20 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('different seeds diverge', () => {
    const a = new Rng('one');
    const b = new Rng('two');
    expect(a.next()).not.toBe(b.next());
  });

  it('a numeric seed and a string seed both work', () => {
    expect(() => new Rng(42).next()).not.toThrow();
    expect(() => new Rng('forty-two').next()).not.toThrow();
  });

  it('a zero seed does not collapse to a constant stream', () => {
    const rng = new Rng(0);
    const values = new Set(Array.from({ length: 10 }, () => rng.next()));
    expect(values.size).toBe(10);
  });

  it('stays inside [0, 1)', () => {
    const rng = new Rng('bounds');
    for (let i = 0; i < 5000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('range and int respect their bounds', () => {
    const rng = new Rng('ranges');
    for (let i = 0; i < 2000; i++) {
      const r = rng.range(-3, 7);
      expect(r).toBeGreaterThanOrEqual(-3);
      expect(r).toBeLessThan(7);
      const n = rng.int(2, 5);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it('is roughly uniform, so scenery does not clump on one side', () => {
    const rng = new Rng('uniformity');
    const buckets = new Array(10).fill(0);
    const samples = 20000;
    for (let i = 0; i < samples; i++) {
      buckets[Math.floor(rng.next() * 10)]++;
    }
    const expected = samples / 10;
    for (const count of buckets) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.12);
    }
  });

  it('pick returns a member and throws on an empty list', () => {
    const rng = new Rng('pick');
    const items = ['a', 'b', 'c'];
    for (let i = 0; i < 50; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow(/empty/);
  });

  it('shuffle is a permutation and leaves the input alone', () => {
    const rng = new Rng('shuffle');
    const input = [1, 2, 3, 4, 5, 6, 7, 8];
    const out = rng.shuffle(input);
    expect(out).not.toBe(input);
    expect([...out].sort((a, b) => a - b)).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('chance(0) never fires and chance(1) always does', () => {
    const rng = new Rng('chance');
    for (let i = 0; i < 200; i++) {
      expect(rng.chance(0)).toBe(false);
      expect(rng.chance(1)).toBe(true);
    }
  });
});

describe('event bus', () => {
  const bus = () => new EventBus<GameEvents>();

  it('delivers a payload to every subscriber', () => {
    const b = bus();
    const a = vi.fn();
    const c = vi.fn();
    b.on('cop:busted', a);
    b.on('cop:busted', c);
    b.emit('cop:busted', {});
    expect(a).toHaveBeenCalledOnce();
    expect(c).toHaveBeenCalledOnce();
  });

  it('unsubscribes via the returned function and via off', () => {
    const b = bus();
    const handler = vi.fn();
    const off = b.on('cop:busted', handler);
    off();
    b.emit('cop:busted', {});
    expect(handler).not.toHaveBeenCalled();

    b.on('cop:busted', handler);
    b.off('cop:busted', handler);
    b.emit('cop:busted', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('once fires exactly once', () => {
    const b = bus();
    const handler = vi.fn();
    b.once('cop:busted', handler);
    b.emit('cop:busted', {});
    b.emit('cop:busted', {});
    expect(handler).toHaveBeenCalledOnce();
  });

  it('a listener that unsubscribes itself mid-emit does not break the others', () => {
    const b = bus();
    const order: string[] = [];
    const off = b.on('cop:busted', () => {
      order.push('first');
      off();
    });
    b.on('cop:busted', () => order.push('second'));
    b.emit('cop:busted', {});
    expect(order).toEqual(['first', 'second']);
    b.emit('cop:busted', {});
    expect(order).toEqual(['first', 'second', 'second']);
  });

  it('emitting an event nobody listens to is harmless', () => {
    expect(() => bus().emit('nitro', { active: true })).not.toThrow();
  });

  it('clear removes everything', () => {
    const b = bus();
    const handler = vi.fn();
    b.on('cop:busted', handler);
    b.clear();
    b.emit('cop:busted', {});
    expect(handler).not.toHaveBeenCalled();
  });

  it('keeps event payloads typed and intact', () => {
    const b = bus();
    let received: GameEvents['impact'] | null = null;
    b.on('impact', (p) => { received = p; });
    b.emit('impact', { kind: 'kick', power: 0.8, pan: -0.3, byPlayer: true });
    expect(received).toEqual({ kind: 'kick', power: 0.8, pan: -0.3, byPlayer: true });
  });
});

/** A minimal in-memory localStorage, so the save tests do not need a browser. */
const withStorage = (impl: Partial<Storage>, run: () => void): void => {
  const original = globalThis.localStorage;
  Object.defineProperty(globalThis, 'localStorage', {
    value: impl, configurable: true, writable: true,
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, 'localStorage', {
      value: original, configurable: true, writable: true,
    });
  }
};

const memoryStorage = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    removeItem: (k: string) => { map.delete(k); },
    _map: map,
  } as unknown as Storage & { _map: Map<string, string> };
};

describe('save data', () => {
  it('the default save is playable: a bike, a circuit and some cash', () => {
    const save = defaultSave();
    expect(save.ownedBikes.length).toBeGreaterThan(0);
    expect(save.ownedBikes).toContain(save.currentBike);
    expect(save.unlockedCircuits.length).toBeGreaterThan(0);
    expect(save.cash).toBeGreaterThan(0);
  });

  it('round-trips through storage', () => {
    withStorage(memoryStorage(), () => {
      const save = { ...defaultSave(), cash: 424242, wins: 7 };
      writeSave(save);
      const loaded = loadSave();
      expect(loaded.cash).toBe(424242);
      expect(loaded.wins).toBe(7);
    });
  });

  it('returns defaults when nothing is stored', () => {
    withStorage(memoryStorage(), () => {
      expect(loadSave().cash).toBe(defaultSave().cash);
    });
  });

  it('survives corrupt JSON rather than taking the game down', () => {
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrage/save/v1', '{ not json at all');
      expect(() => loadSave()).not.toThrow();
      expect(loadSave().cash).toBe(defaultSave().cash);
    });
  });

  it('merges an older, partial save over the defaults', () => {
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrage/save/v1', JSON.stringify({ cash: 99, wins: 3 }));
      const loaded = loadSave();
      expect(loaded.cash).toBe(99);
      expect(loaded.wins).toBe(3);
      // Fields the old save never had come from the defaults.
      expect(loaded.settings.masterVolume).toBe(defaultSave().settings.masterVolume);
      expect(loaded.ownedBikes).toEqual(defaultSave().ownedBikes);
    });
  });

  it('repairs a save whose selected bike is not owned', () => {
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrage/save/v1', JSON.stringify({
        ownedBikes: ['rx100'], currentBike: 'duke390',
      }));
      const loaded = loadSave();
      expect(loaded.ownedBikes).toContain(loaded.currentBike);
    });
  });

  it('repairs a save with an empty garage or no unlocked circuits', () => {
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrage/save/v1', JSON.stringify({
        ownedBikes: [], unlockedCircuits: [], cash: Number.NaN,
      }));
      const loaded = loadSave();
      expect(loaded.ownedBikes.length).toBeGreaterThan(0);
      expect(loaded.unlockedCircuits.length).toBeGreaterThan(0);
      expect(Number.isFinite(loaded.cash)).toBe(true);
    });
  });

  it('carries a career across the rename instead of wiping it', () => {
    // The game saved under 'roadrash-bharat/save/v1' before it became RoadRage.
    // Changing the key without a fallback silently resets everyone's career to
    // a default garage and 12,000 rupees, which looks exactly like a bug report
    // about lost progress.
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrash-bharat/save/v1', JSON.stringify({
        cash: 87_500, wins: 14, ownedBikes: ['splendor', 'rx100'], currentBike: 'rx100',
      }));
      const loaded = loadSave();
      expect(loaded.cash).toBe(87_500);
      expect(loaded.wins).toBe(14);
      expect(loaded.currentBike).toBe('rx100');
    });
  });

  it('prefers the current save when both keys are present', () => {
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrash-bharat/save/v1', JSON.stringify({ cash: 1 }));
      storage.setItem('roadrage/save/v1', JSON.stringify({ cash: 2 }));
      expect(loadSave().cash).toBe(2);
    });
  });

  it('a wipe clears the pre-rename save too', () => {
    // Otherwise the old career resurrects on the next load and the wipe looks
    // like it silently failed.
    const storage = memoryStorage();
    withStorage(storage, () => {
      storage.setItem('roadrash-bharat/save/v1', JSON.stringify({ cash: 99_999 }));
      storage.setItem('roadrage/save/v1', JSON.stringify({ cash: 99_999 }));
      clearSave();
      expect(loadSave().cash).toBe(defaultSave().cash);
    });
  });

  it('a storage that throws on write does not take the session down', () => {
    const throwing = {
      getItem: () => null,
      setItem: () => { throw new Error('QuotaExceededError'); },
      removeItem: () => { throw new Error('denied'); },
    } as unknown as Storage;
    withStorage(throwing, () => {
      expect(() => writeSave(defaultSave() as SaveData)).not.toThrow();
      expect(() => clearSave()).not.toThrow();
      expect(() => loadSave()).not.toThrow();
    });
  });
});
