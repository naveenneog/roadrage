import { formatTime, ordinal, toKmh } from '../core/math.ts';
import type { SaveData } from '../core/storage.ts';
import { getBike } from '../data/bikes.ts';
import { CAREER_ORDER, CIRCUITS, getCircuit } from '../data/circuits.ts';
import type { CircuitSpec } from '../data/types.ts';
import { Garage } from './garage.ts';

export type ScreenId =
  | 'title' | 'garage' | 'circuits' | 'results' | 'paused' | 'settings' | 'story' | 'campaign';

export interface ScreenActions {
  startRace(circuitId: string, bikeId: string): void;
  startCampaign(chapter: number): void;
  show(screen: ScreenId): void;
  buyBike(bikeId: string): boolean;
  selectBike(bikeId: string): void;
  resume(): void;
  quitToTitle(): void;
  retry(): void;
  next(): void;
  updateSettings(patch: Partial<SaveData['settings']>): void;
  save(): SaveData;
  /** True while a race is in progress, so Settings knows where Back should go. */
  inRace(): boolean;
  enableTilt(): Promise<boolean>;
}

const el = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const rupees = (amount: number): string => `₹${amount.toLocaleString('en-IN')}`;

/**
 * All out-of-race UI, built as real DOM rather than drawn on the canvas.
 *
 * That choice buys keyboard navigation, screen-reader labels, text selection and
 * native scrolling for free — none of which a canvas menu gets without being
 * rebuilt from scratch.
 */
export class Screens {
  private readonly root: HTMLElement;
  private current: ScreenId | null = null;
  private garageView: Garage | null = null;

  constructor(root: HTMLElement, private readonly actions: ScreenActions) {
    this.root = root;
  }

  get visible(): ScreenId | null {
    return this.current;
  }

  hide(): void {
    this.current = null;
    this.garageView?.dispose();
    this.garageView = null;
    this.root.replaceChildren();
  }

  show(screen: ScreenId, payload?: unknown): void {
    // The garage runs an animation loop; leaving it attached to a detached
    // canvas would keep a rAF alive for the rest of the session.
    if (this.current === 'garage' && screen !== 'garage') {
      this.garageView?.dispose();
      this.garageView = null;
    }
    this.current = screen;
    this.root.replaceChildren();
    const save = this.actions.save();

    switch (screen) {
      case 'title': this.root.append(this.title(save)); break;
      case 'garage': this.root.append(this.garage()); break;
      case 'circuits': this.root.append(this.circuits(save)); break;
      case 'campaign': this.root.append(this.campaign(save)); break;
      case 'results': this.root.append(this.results(payload as ResultsPayload)); break;
      case 'paused': this.root.append(this.paused()); break;
      case 'settings': this.root.append(this.settings(save)); break;
      case 'story': this.root.append(this.story(payload as StoryPayload)); break;
    }

    // Move focus to the first control so a keyboard or a screen reader lands somewhere useful.
    const first = this.root.querySelector<HTMLElement>('button:not(:disabled)');
    first?.focus({ preventScroll: true });
  }

  private screen(id: string): HTMLElement {
    const node = el('section', 'screen');
    node.id = `screen-${id}`;
    return node;
  }

  /**
   * A selectable card: a plain block slot, a button inside it, and a flex body
   * inside that.
   *
   * All three layers are load-bearing. A `<button>` will not size to its own
   * content while it *is* the grid item — the track gets a bogus intrinsic
   * height and every card is either clipped to it or paints straight through
   * the card below. Putting an ordinary block between the grid and the button
   * restores normal sizing, and the inner body carries the flex layout the
   * button cannot. `qa-ui.mjs` fails the build if this regresses.
   */
  private card(): { slot: HTMLElement; card: HTMLButtonElement; body: HTMLElement } {
    const slot = el('div', 'card-slot');
    const card = el('button', 'card');
    const body = el('span', 'card-body');
    card.append(body);
    slot.append(card);
    return { slot, card, body };
  }

  /* ─────────────────────────── title ─────────────────────────── */

  private title(save: SaveData): HTMLElement {
    const node = this.screen('title');

    const h1 = el('h1', 'title');
    h1.append(document.createTextNode('ROAD RASH'));
    h1.append(el('span', 'accent', 'BHARAT'));
    node.append(h1);

    node.append(el('p', 'tagline',
      'Street bike combat racing through Bengaluru, Thane, Pune, Mumbai and the Ghats. ' +
      'Kick first. Apologise at the finish line.'));

    const menu = el('div', 'menu');

    const race = el('button', 'primary', 'Race');
    race.addEventListener('click', () => this.actions.show('circuits'));
    menu.append(race);

    const campaign = el('button', undefined, 'Auto Rickshaw Edition — Night Fare');
    campaign.addEventListener('click', () => this.actions.show('campaign'));
    menu.append(campaign);

    const garage = el('button', undefined, `Garage · ${rupees(save.cash)}`);
    garage.addEventListener('click', () => this.actions.show('garage'));
    menu.append(garage);

    const settings = el('button', 'ghost', 'Settings');
    settings.addEventListener('click', () => this.actions.show('settings'));
    menu.append(settings);

    node.append(menu);

    const hint = el('p', 'hint');
    hint.innerHTML =
      'Steer <kbd>←</kbd><kbd>→</kbd> · Throttle <kbd>↑</kbd> · Brake <kbd>↓</kbd> · ' +
      'Punch <kbd>J</kbd> · Kick <kbd>K</kbd> · Boost <kbd>Shift</kbd> · Horn <kbd>H</kbd> · ' +
      'Pause <kbd>Esc</kbd><br>On a phone: turn it sideways and use the on-screen controls.';
    node.append(hint);

    if (save.races > 0) {
      node.append(el('p', 'hint',
        `${save.wins} wins from ${save.races} races · ${save.takedowns} riders put down`));
    }
    return node;
  }

  /* ─────────────────────────── garage ─────────────────────────── */

  private garage(): HTMLElement {
    this.garageView?.dispose();
    this.garageView = new Garage({
      buyBike: (id) => this.actions.buyBike(id),
      selectBike: (id) => this.actions.selectBike(id),
      save: () => this.actions.save(),
      back: () => this.actions.show('title'),
    });
    return this.garageView.build();
  }

  /* ─────────────────────────── circuits ─────────────────────────── */

  private circuits(save: SaveData): HTMLElement {
    const node = this.screen('circuits');
    node.append(el('h1', 'title', 'CIRCUITS'));

    const bike = getBike(save.currentBike);
    node.append(el('p', 'tagline',
      `Riding the ${bike.maker} ${bike.name}. Win to unlock the next event.`));

    const list = el('div', 'card-list');
    for (const id of CAREER_ORDER) {
      const circuit = getCircuit(id);
      list.append(this.circuitCard(circuit, save));
    }
    node.append(list);

    const row = el('div', 'row');
    const garage = el('button', undefined, 'Garage');
    garage.addEventListener('click', () => this.actions.show('garage'));
    row.append(garage);
    const back = el('button', 'ghost', '← Back');
    back.addEventListener('click', () => this.actions.show('title'));
    row.append(back);
    node.append(row);
    return node;
  }

  private circuitCard(circuit: CircuitSpec, save: SaveData): HTMLElement {
    const unlocked = save.unlockedCircuits.includes(circuit.id);
    const best = save.bestTimes[circuit.id];

    const { slot, card, body } = this.card();
    card.disabled = !unlocked || save.cash < circuit.entryFee;

    body.append(el('span', 'maker', `${circuit.city} · ${'★'.repeat(circuit.difficulty)}`));
    body.append(el('span', 'name', circuit.name));
    body.append(el('span', 'meta',
      `${circuit.location} · ${circuit.laps} lap${circuit.laps > 1 ? 's' : ''} · ${circuit.timeOfDay}`));
    body.append(el('span', 'blurb', circuit.blurb));
    body.append(el('span', 'note', circuit.note));

    if (!unlocked) {
      body.append(el('span', 'locked', 'Locked — win the previous event'));
    } else {
      body.append(el('span', 'cash',
        `Purse ${rupees(circuit.purse)}${circuit.entryFee ? ` · Entry ${rupees(circuit.entryFee)}` : ' · Free entry'}`));
      if (best) body.append(el('span', 'meta', `Best ${formatTime(best)}`));
      if (save.cash < circuit.entryFee) body.append(el('span', 'locked', 'Not enough cash'));
    }

    card.addEventListener('click', () => {
      this.actions.startRace(circuit.id, save.currentBike);
    });
    return slot;
  }

  /* ─────────────────────────── campaign ─────────────────────────── */

  private campaign(save: SaveData): HTMLElement {
    const node = this.screen('campaign');
    node.append(el('h1', 'title', 'NIGHT FARE'));
    node.append(el('p', 'tagline',
      'You drive an auto. Three wheels, ten horsepower, and a passenger who will not say ' +
      'where she is going — only that you must not stop.'));

    const list = el('div', 'card-list');
    for (let i = 0; i < CAMPAIGN_CHAPTERS.length; i++) {
      const chapter = CAMPAIGN_CHAPTERS[i] as CampaignChapter;
      const unlocked = i <= save.storyChapter;
      const { slot, card, body } = this.card();
      card.disabled = !unlocked;
      body.append(el('span', 'maker', `Chapter ${i + 1} · ${getCircuit(chapter.circuitId).city}`));
      body.append(el('span', 'name', chapter.title));
      body.append(el('span', 'blurb', chapter.premise));
      if (!unlocked) body.append(el('span', 'locked', 'Locked'));
      card.addEventListener('click', () => this.actions.startCampaign(i));
      list.append(slot);
    }
    node.append(list);

    const row = el('div', 'row');
    const back = el('button', 'ghost', '← Back');
    back.addEventListener('click', () => this.actions.show('title'));
    row.append(back);
    node.append(row);
    return node;
  }

  /* ─────────────────────────── results ─────────────────────────── */

  private results(payload: ResultsPayload): HTMLElement {
    const node = this.screen('results');
    const panel = el('div', 'panel');

    const won = payload.position === 1;
    panel.append(el('h2', undefined,
      payload.wrecked ? 'WRECKED' : won ? 'WINNER' : `${ordinal(payload.position)} PLACE`));

    const grid = el('dl', 'result-grid');
    const add = (label: string, value: string, win = false) => {
      grid.append(el('dt', undefined, label));
      const dd = el('dd', win ? 'win' : undefined, value);
      grid.append(dd);
    };
    add('Circuit', payload.circuitName);
    add('Time', formatTime(payload.timeSeconds));
    add('Position', `${ordinal(payload.position)} of ${payload.fieldSize}`, won);
    add('Top speed', `${toKmh(payload.topSpeed)} km/h`);
    add('Takedowns', `${payload.takedowns}`);
    add('Bike damage', `${Math.round(payload.damage)}%`);
    add('Prize', rupees(payload.cash), payload.cash > 0);
    if (payload.best) add('New best lap', formatTime(payload.timeSeconds), true);
    panel.append(grid);

    if (payload.unlocked) {
      panel.append(el('p', 'cash', `Unlocked: ${payload.unlocked}`));
    }

    const row = el('div', 'row');
    if (payload.canContinue) {
      const next = el('button', 'primary', 'Next event');
      next.addEventListener('click', () => this.actions.next());
      row.append(next);
    }
    const retry = el('button', undefined, 'Race again');
    retry.addEventListener('click', () => this.actions.retry());
    row.append(retry);
    const quit = el('button', 'ghost', 'Back to circuits');
    quit.addEventListener('click', () => this.actions.show('circuits'));
    row.append(quit);
    panel.append(row);

    node.append(panel);
    return node;
  }

  /* ─────────────────────────── pause & settings ─────────────────────────── */

  private paused(): HTMLElement {
    const node = this.screen('paused');
    const panel = el('div', 'panel');
    panel.append(el('h2', undefined, 'PAUSED'));

    const row = el('div', 'row');
    const resume = el('button', 'primary', 'Resume');
    resume.addEventListener('click', () => this.actions.resume());
    row.append(resume);
    const restart = el('button', undefined, 'Restart');
    restart.addEventListener('click', () => this.actions.retry());
    row.append(restart);
    const settings = el('button', undefined, 'Settings');
    settings.addEventListener('click', () => this.actions.show('settings'));
    row.append(settings);
    const quit = el('button', 'ghost', 'Quit to menu');
    quit.addEventListener('click', () => this.actions.quitToTitle());
    row.append(quit);
    panel.append(row);

    node.append(panel);
    return node;
  }

  private settings(save: SaveData): HTMLElement {
    const node = this.screen('settings');
    const panel = el('div', 'panel');
    panel.append(el('h2', undefined, 'SETTINGS'));

    const slider = (
      label: string,
      value: number,
      onChange: (v: number) => void,
    ): HTMLElement => {
      const row = el('div', 'setting');
      const id = `set-${label.replace(/\s+/g, '-').toLowerCase()}`;
      const labelEl = el('label', undefined, label);
      labelEl.htmlFor = id;
      row.append(labelEl);
      const input = el('input');
      input.type = 'range';
      input.id = id;
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(value * 100));
      input.addEventListener('input', () => onChange(Number(input.value) / 100));
      row.append(input);
      return row;
    };

    panel.append(slider('Master volume', save.settings.masterVolume,
      (v) => this.actions.updateSettings({ masterVolume: v })));
    panel.append(slider('Music', save.settings.musicVolume,
      (v) => this.actions.updateSettings({ musicVolume: v })));
    panel.append(slider('Effects', save.settings.sfxVolume,
      (v) => this.actions.updateSettings({ sfxVolume: v })));

    const toggle = (
      label: string,
      value: boolean,
      onChange: (v: boolean) => void,
    ): HTMLElement => {
      const row = el('div', 'setting');
      const id = `set-${label.replace(/\s+/g, '-').toLowerCase()}`;
      const labelEl = el('label', undefined, label);
      labelEl.htmlFor = id;
      row.append(labelEl);
      const input = el('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = value;
      input.addEventListener('change', () => onChange(input.checked));
      row.append(input);
      return row;
    };

    panel.append(toggle('Tilt steering (phone)', save.settings.tiltSteering, async (v) => {
      if (v) {
        const granted = await this.actions.enableTilt();
        this.actions.updateSettings({ tiltSteering: granted });
        if (!granted) this.show('settings');
      } else {
        this.actions.updateSettings({ tiltSteering: false });
      }
    }));
    panel.append(toggle('Show frame rate', save.settings.showFps,
      (v) => this.actions.updateSettings({ showFps: v })));
    panel.append(toggle('Reduce motion', save.settings.reducedMotion,
      (v) => this.actions.updateSettings({ reducedMotion: v })));

    const qualityRow = el('div', 'setting');
    const qLabel = el('label', undefined, 'Graphics');
    qLabel.htmlFor = 'set-quality';
    qualityRow.append(qLabel);
    const select = el('select');
    select.id = 'set-quality';
    for (const option of ['auto', 'low', 'medium', 'high'] as const) {
      const opt = el('option', undefined, option[0]!.toUpperCase() + option.slice(1));
      opt.value = option;
      if (save.settings.quality === option) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () =>
      this.actions.updateSettings({ quality: select.value as SaveData['settings']['quality'] }));
    qualityRow.append(select);
    panel.append(qualityRow);

    const row = el('div', 'row');
    const back = el('button', 'ghost', '← Back');
    // Derived from live game state, not from a latch: a stale latch sends you
    // to a dead pause menu over the title screen, and a missing one drops you
    // out of a campaign race into the title while the race keeps rendering.
    back.addEventListener('click', () =>
      this.actions.show(this.actions.inRace() ? 'paused' : 'title'));
    row.append(back);
    panel.append(row);

    node.append(panel);
    return node;
  }

  /* ─────────────────────────── story ─────────────────────────── */

  private story(payload: StoryPayload): HTMLElement {
    const node = this.screen('story');
    const panel = el('div', 'panel');
    panel.append(el('h2', undefined, payload.title));
    for (const line of payload.lines) {
      panel.append(el('p', 'blurb', line));
    }
    const row = el('div', 'row');
    const go = el('button', 'primary', payload.cta ?? 'Drive');
    go.addEventListener('click', payload.onContinue);
    row.append(go);
    const back = el('button', 'ghost', 'Back');
    back.addEventListener('click', () => this.actions.show('campaign'));
    row.append(back);
    panel.append(row);
    node.append(panel);
    return node;
  }
}

export interface ResultsPayload {
  circuitName: string;
  position: number;
  fieldSize: number;
  timeSeconds: number;
  cash: number;
  takedowns: number;
  damage: number;
  topSpeed: number;
  wrecked: boolean;
  best: boolean;
  unlocked: string | null;
  canContinue: boolean;
}

export interface StoryPayload {
  title: string;
  lines: string[];
  cta?: string;
  onContinue: () => void;
}

export interface CampaignChapter {
  title: string;
  circuitId: string;
  premise: string;
  opening: string[];
  beats: Array<{ atLap: number; speaker: string; line: string }>;
  /** Rivals become pursuers: more aggressive, and they do not race to win. */
  hunters: number;
  reward: number;
}

/**
 * The Auto Rickshaw Edition. Six chapters, all at night, all in the auto.
 *
 * The thriller framing does the heavy lifting that the vehicle cannot: a
 * three-wheeler that tips in corners and tops out at 65 km/h is a terrible
 * racer, so the mode is never a race. It is a pursuit you are losing.
 */
export const CAMPAIGN_CHAPTERS: readonly CampaignChapter[] = [
  {
    title: 'The Last Fare',
    circuitId: 'shivajinagar',
    premise: 'A woman gets in at Shivajinagar bus stand at 11:40pm and says "drive".',
    opening: [
      'You have been on shift since six in the morning. The meter says ₹1,240 for the day.',
      'She gets in without asking the fare, which nobody does, and she does not close the door properly, which everybody does.',
      '"Just drive. Anywhere. Don\'t stop at the signal."',
      'In the mirror, two headlights pull out of the bus stand behind you.',
    ],
    beats: [
      { atLap: 0, speaker: 'Sawari', line: 'Don\'t look back. Just go. I will pay whatever the meter says.' },
      { atLap: 1, speaker: 'Sawari', line: 'They are still there. Take the small lane, the one by the market.' },
    ],
    hunters: 3,
    reward: 30000,
  },
  {
    title: 'Ghodbunder, 1:15am',
    circuitId: 'ghodbunder',
    premise: 'Eighteen kilometres of empty six-lane, and nowhere at all to hide.',
    opening: [
      'She has not said a word in forty minutes. The CNG gauge is at a quarter.',
      '"Take the highway. They cannot follow us in the traffic if there is no traffic."',
      'It is the worst plan you have ever heard. You take the highway.',
    ],
    beats: [
      { atLap: 0, speaker: 'Sawari', line: 'Faster. I know this thing goes faster than this.' },
      { atLap: 0, speaker: 'You', line: 'Madam, it is a two-hundred-and-thirty-six cc engine carrying three hundred and sixty kilos.' },
    ],
    hunters: 4,
    reward: 45000,
  },
  {
    title: 'Yeoor, In The Rain',
    circuitId: 'yeoor',
    premise: 'Up into the hills, in monsoon, on three wheels with no lean and no grip.',
    opening: [
      'The rain arrives the way it does here — all at once, sideways.',
      '"There is a gate at the top. My brother is there. He has been there since Tuesday."',
      'The road goes up a hundred and fifty metres in three kilometres. Your auto does not want to go up anything.',
    ],
    beats: [
      { atLap: 0, speaker: 'Sawari', line: 'Slower on the bends! This thing will roll!' },
      { atLap: 1, speaker: 'Sawari', line: 'There. The gate. Do not slow down for the gate.' },
    ],
    hunters: 4,
    reward: 60000,
  },
  {
    title: 'Queen\'s Necklace',
    circuitId: 'marine-drive',
    premise: 'Three kilometres of Marine Drive at two in the morning, lit like a runway.',
    opening: [
      'Her brother was not at the gate. Something else was.',
      'Now you are driving down the most beautiful road in India with a broken headlight and a passenger who has stopped pretending to be calm.',
      '"Nariman Point. There is a boat. Please."',
    ],
    beats: [
      { atLap: 0, speaker: 'Sawari', line: 'They have called more of them. Look at the lights behind.' },
      { atLap: 1, speaker: 'You', line: 'Madam. What is in the bag.' },
    ],
    hunters: 5,
    reward: 85000,
  },
  {
    title: 'Chandni Chowk',
    circuitId: 'chandni-chowk',
    premise: 'Lanes too narrow for a car. That is the entire plan.',
    opening: [
      'The boat was a lie, or the boat left. You did not ask which.',
      'By dawn you are in Delhi, in galis two and a half metres wide, and for the first time all night you have the advantage.',
      '"Nothing they drive can fit in here." She is almost smiling. "Go."',
    ],
    beats: [
      { atLap: 0, speaker: 'Sawari', line: 'They are on foot now. And on bikes.' },
      { atLap: 2, speaker: 'Sawari', line: 'One more turn. One more.' },
    ],
    hunters: 5,
    reward: 110000,
  },
  {
    title: 'Malshej',
    circuitId: 'malshej',
    premise: 'The last road. Seven hundred metres up, in fog, with no guardrail.',
    opening: [
      'She finally tells you where you are going, and it is not a place, it is a person.',
      'Malshej Ghat in monsoon fog: hairpins with nothing on the outside but weather.',
      '"After this you never saw me. Agreed?"',
      'The meter has been running for nine hours. It says ₹6,318.',
    ],
    beats: [
      { atLap: 0, speaker: 'Sawari', line: 'Whatever happens on this road, do not stop.' },
    ],
    hunters: 6,
    reward: 200000,
  },
];

export { CIRCUITS };
