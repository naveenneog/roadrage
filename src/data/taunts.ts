/**
 * What other road users shout at you.
 *
 * Indian traffic is loud and personal, and the abuse is regional: you get
 * Kannada in Bengaluru, Marathi in Thane and Mumbai, Hindi in Delhi. Getting
 * that wrong is as jarring as a London bus in Bengaluru, so the language
 * follows the circuit's city rather than being one generic pool.
 *
 * Two tiers. `mild` is the default and is what most of this actually is —
 * exasperated, sarcastic, more wounded than aggressive. `strong` is the harder
 * street stuff and stays behind a setting that is off by default, with the
 * coarsest words masked. Players who want the full flavour can turn it on;
 * nobody gets it by surprise, and it will not catch a young player or an office
 * screen unawares.
 */

export type TauntTier = 'mild' | 'strong';

export interface Taunt {
  /** What appears on screen. */
  text: string;
  /** Plain-English gloss, shown as a subtitle when subtitles are on. */
  gloss: string;
  tier: TauntTier;
}

/** Kannada — Bengaluru. */
const KANNADA: readonly Taunt[] = [
  { text: 'Nodkondu hogo!', gloss: 'Look where you are going!', tier: 'mild' },
  { text: 'Maneli helbittu bandidya?', gloss: 'Did you tell them at home before leaving?', tier: 'mild' },
  { text: 'Guldu! Kannu kaanalva?', gloss: 'Oi! Are you blind?', tier: 'mild' },
  { text: 'Yaako gube!', gloss: 'Oi, you owl!', tier: 'mild' },
  { text: 'Swalpa nidhaana!', gloss: 'Slow down a bit!', tier: 'mild' },
  { text: 'Life ge bere kelsa illva?', gloss: 'Have you nothing better to do?', tier: 'mild' },
  { text: 'Bike na? Rocket na?', gloss: 'Is that a bike or a rocket?', tier: 'mild' },
  { text: 'Nodkondu hogo, ga**u!', gloss: 'Look where you are going, you fool!', tier: 'strong' },
  { text: 'Ti** muchko!', gloss: 'Shut it!', tier: 'strong' },
];

/** Marathi — Thane, Mumbai, Pune. */
const MARATHI: readonly Taunt[] = [
  { text: 'Are bagh na!', gloss: 'Oi, watch out!', tier: 'mild' },
  { text: 'Kay chalu aahe?', gloss: 'What is going on?', tier: 'mild' },
  { text: 'Dola nahi ka?', gloss: 'Have you no eyes?', tier: 'mild' },
  { text: 'Ghari sangun aalas ka?', gloss: 'Did you tell them at home before coming?', tier: 'mild' },
  { text: 'Hळू ja re!', gloss: 'Go slowly!', tier: 'mild' },
  { text: 'Vimaan chalavtoy ka?', gloss: 'Are you flying a plane?', tier: 'mild' },
  { text: 'Ae ba**ya!', gloss: 'Oi, you idiot!', tier: 'strong' },
];

/** Hindi — Delhi. */
const HINDI: readonly Taunt[] = [
  { text: 'Dekh ke chala!', gloss: 'Watch where you are going!', tier: 'mild' },
  { text: 'Andha hai kya?', gloss: 'Are you blind?', tier: 'mild' },
  { text: 'Baap ka road hai?', gloss: 'Does your father own this road?', tier: 'mild' },
  { text: 'Ghar pe bata ke aaya hai?', gloss: 'Did you tell them at home before coming?', tier: 'mild' },
  { text: 'Marne ka shauk hai?', gloss: 'Do you have a death wish?', tier: 'mild' },
  { text: 'Oye hero!', gloss: 'Oi, hero!', tier: 'mild' },
  { text: 'Abey sa**e!', gloss: 'Oi, you swine!', tier: 'strong' },
];

/** Konkani and Hindi — Goa. */
const KONKANI: readonly Taunt[] = [
  { text: 'Polle re!', gloss: 'Look out!', tier: 'mild' },
  { text: 'Sokoll vhor!', gloss: 'Slow down!', tier: 'mild' },
  { text: 'Kitem karta?', gloss: 'What are you doing?', tier: 'mild' },
  { text: 'Dekh ke chala!', gloss: 'Watch where you are going!', tier: 'mild' },
  { text: 'Susegad, baba!', gloss: 'Take it easy, friend!', tier: 'mild' },
];

const BY_CITY: Record<string, readonly Taunt[]> = {
  bengaluru: KANNADA,
  thane: MARATHI,
  mumbai: MARATHI,
  pune: MARATHI,
  delhi: HINDI,
  goa: KONKANI,
};

export const tauntsFor = (city: string, allowStrong: boolean): readonly Taunt[] => {
  const pool = BY_CITY[city] ?? KANNADA;
  return allowStrong ? pool : pool.filter((t) => t.tier === 'mild');
};

/**
 * Pick a taunt. `seed` keeps it deterministic so a replay of the same race
 * produces the same abuse, which matters for the simulation tests.
 */
export const pickTaunt = (city: string, allowStrong: boolean, seed: number): Taunt => {
  const pool = tauntsFor(city, allowStrong);
  const index = Math.abs(Math.floor(seed)) % pool.length;
  return pool[index] as Taunt;
};
