/**
 * localStorage-backed save with a schema version and total failure tolerance —
 * private-mode Safari throws on write, and that must never take the game down.
 */
const KEY = 'roadrage/save/v1';

/**
 * The key this game saved under before it was renamed from Road Rash Bharat.
 * Read as a fallback so a rename does not silently wipe someone's career; the
 * next write lands on the current key and the old one is only cleared when the
 * player asks for a wipe.
 */
const LEGACY_KEY = 'roadrash-bharat/save/v1';

export interface SaveData {
  version: 1;
  cash: number;
  ownedBikes: string[];
  currentBike: string;
  unlockedCircuits: string[];
  careerLevel: number;
  storyChapter: number;
  bestTimes: Record<string, number>;
  wins: number;
  races: number;
  takedowns: number;
  settings: {
    masterVolume: number;
    musicVolume: number;
    sfxVolume: number;
    tiltSteering: boolean;
    reducedMotion: boolean;
    quality: 'low' | 'medium' | 'high' | 'auto';
    showFps: boolean;
    /** Allow the coarser tier of street abuse from other road users. */
    strongLanguage: boolean;
    /** Show a plain-English gloss under each shout. */
    tauntSubtitles: boolean;
  };
}

export const defaultSave = (): SaveData => ({
  version: 1,
  cash: 12000,
  ownedBikes: ['splendor'],
  currentBike: 'splendor',
  unlockedCircuits: ['shivajinagar'],
  careerLevel: 1,
  storyChapter: 0,
  bestTimes: {},
  wins: 0,
  races: 0,
  takedowns: 0,
  settings: {
    masterVolume: 0.8,
    musicVolume: 0.5,
    sfxVolume: 0.9,
    tiltSteering: false,
    reducedMotion: false,
    quality: 'auto',
    showFps: false,
    // Off by default: the milder pool is the funnier one anyway, and nobody
    // should be surprised by the coarse tier on a shared screen.
    strongLanguage: false,
    tauntSubtitles: true,
  },
});

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Merge stored data over defaults so a save from an older build never crashes a newer one. */
const reconcile = (stored: unknown): SaveData => {
  const base = defaultSave();
  if (!isRecord(stored)) return base;
  const merged: SaveData = { ...base, ...(stored as Partial<SaveData>), version: 1 };
  merged.settings = { ...base.settings, ...(isRecord(stored.settings) ? stored.settings : {}) };
  merged.bestTimes = isRecord(stored.bestTimes) ? (stored.bestTimes as Record<string, number>) : {};
  if (!Array.isArray(merged.ownedBikes) || merged.ownedBikes.length === 0) {
    merged.ownedBikes = base.ownedBikes;
  }
  if (!Array.isArray(merged.unlockedCircuits) || merged.unlockedCircuits.length === 0) {
    merged.unlockedCircuits = base.unlockedCircuits;
  }
  if (!merged.ownedBikes.includes(merged.currentBike)) {
    merged.currentBike = merged.ownedBikes[0] as string;
  }
  if (!Number.isFinite(merged.cash)) merged.cash = base.cash;
  return merged;
};

export const loadSave = (): SaveData => {
  try {
    const raw = localStorage.getItem(KEY) ?? localStorage.getItem(LEGACY_KEY);
    if (!raw) return defaultSave();
    return reconcile(JSON.parse(raw));
  } catch {
    return defaultSave();
  }
};

export const writeSave = (data: SaveData): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Storage denied or full. The session still plays; only persistence is lost.
  }
};

export const clearSave = (): void => {
  try {
    localStorage.removeItem(KEY);
    // Both, or the pre-rename save would come back on the next load.
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* nothing to recover from */
  }
};
