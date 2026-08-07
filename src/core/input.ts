import { clamp } from './math.ts';

export type Action =
  | 'left'
  | 'right'
  | 'throttle'
  | 'brake'
  | 'punch'
  | 'kick'
  | 'nitro'
  | 'horn'
  | 'pause'
  | 'confirm';

export interface InputSnapshot {
  /** -1 (full left) .. +1 (full right), analogue where the device allows. */
  steer: number;
  throttle: number;
  brake: number;
  held: Readonly<Record<Action, boolean>>;
  pressed: Readonly<Record<Action, boolean>>;
  /** True while the player is driving with a thumb on glass — the HUD grows for it. */
  touchActive: boolean;
}

const ACTIONS: Action[] = [
  'left', 'right', 'throttle', 'brake', 'punch', 'kick', 'nitro', 'horn', 'pause', 'confirm',
];

const KEY_MAP: Record<string, Action[]> = {
  ArrowLeft: ['left'], KeyA: ['left'],
  ArrowRight: ['right'], KeyD: ['right'],
  ArrowUp: ['throttle'], KeyW: ['throttle'],
  ArrowDown: ['brake'], KeyS: ['brake'],
  KeyJ: ['punch'], KeyZ: ['punch'],
  KeyK: ['kick'], KeyX: ['kick'],
  ShiftLeft: ['nitro'], ShiftRight: ['nitro'], KeyL: ['nitro'],
  KeyH: ['horn'],
  Escape: ['pause'], KeyP: ['pause'],
  Enter: ['confirm'], Space: ['confirm', 'horn'],
};

/** Standard-gamepad button index -> action. */
const PAD_MAP: Record<number, Action> = {
  0: 'punch', 1: 'kick', 2: 'horn', 3: 'nitro',
  4: 'brake', 5: 'nitro', 6: 'brake', 7: 'throttle',
  9: 'pause', 12: 'throttle', 13: 'brake', 14: 'left', 15: 'right',
};

const emptyRecord = (): Record<Action, boolean> =>
  Object.fromEntries(ACTIONS.map((a) => [a, false])) as Record<Action, boolean>;

interface TouchZone {
  action: Action;
  /** Fractions of the canvas rect. */
  x: number; y: number; w: number; h: number;
  label: string;
  shape: 'round' | 'wide';
}

/**
 * Layout is authored in fractions so it survives any phone aspect ratio.
 * Steering lives on the left thumb, everything violent on the right.
 */
export const TOUCH_ZONES: readonly TouchZone[] = [
  { action: 'left',     x: 0.015, y: 0.60, w: 0.115, h: 0.34, label: '◀',  shape: 'round' },
  { action: 'right',    x: 0.145, y: 0.60, w: 0.115, h: 0.34, label: '▶',  shape: 'round' },
  { action: 'brake',    x: 0.015, y: 0.30, w: 0.115, h: 0.24, label: 'BRK', shape: 'round' },
  { action: 'throttle', x: 0.865, y: 0.60, w: 0.12,  h: 0.34, label: 'GAS', shape: 'round' },
  { action: 'kick',     x: 0.725, y: 0.62, w: 0.115, h: 0.30, label: 'KICK', shape: 'round' },
  { action: 'punch',    x: 0.725, y: 0.28, w: 0.115, h: 0.28, label: 'HIT', shape: 'round' },
  { action: 'nitro',    x: 0.865, y: 0.30, w: 0.12,  h: 0.24, label: 'BOOST', shape: 'round' },
];

export interface InputOptions {
  /** Steer by tilting the phone instead of tapping arrows. */
  tilt: boolean;
  /** Degrees of tilt for full lock. */
  tiltRange: number;
  invertTilt: boolean;
}

/**
 * One input surface over keyboard, touch, gamepad and device tilt.
 * Every source writes into the same held/pressed sets, so game code never
 * asks "which device is this?".
 */
export class Input {
  private held = emptyRecord();
  private pressedThisFrame = emptyRecord();
  private consumed = emptyRecord();
  private analogueSteer = 0;
  private tiltSteer = 0;
  private touchPointers = new Map<number, Action[]>();
  private disposers: Array<() => void> = [];
  private lastTouchAt = -1e9;

  readonly options: InputOptions = { tilt: false, tiltRange: 22, invertTilt: false };

  constructor(private readonly surface: HTMLElement) {}

  attach(): void {
    const onKey = (down: boolean) => (e: KeyboardEvent) => {
      const actions = KEY_MAP[e.code];
      if (!actions) return;
      // Arrow keys and space scroll the page otherwise, which fights the game.
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
      if (down && e.repeat) return;
      for (const action of actions) this.set(action, down);
    };
    const keyDown = onKey(true);
    const keyUp = onKey(false);
    window.addEventListener('keydown', keyDown, { passive: false });
    window.addEventListener('keyup', keyUp);
    this.disposers.push(() => window.removeEventListener('keydown', keyDown));
    this.disposers.push(() => window.removeEventListener('keyup', keyUp));

    const pointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      this.lastTouchAt = performance.now();
      const actions = this.hitZones(e);
      if (actions.length === 0) return;
      e.preventDefault();
      this.surface.setPointerCapture?.(e.pointerId);
      this.touchPointers.set(e.pointerId, actions);
      for (const a of actions) this.set(a, true);
    };
    const pointerMove = (e: PointerEvent) => {
      if (!this.touchPointers.has(e.pointerId)) return;
      this.lastTouchAt = performance.now();
      const previous = this.touchPointers.get(e.pointerId) ?? [];
      const next = this.hitZones(e);
      // Sliding a thumb from GAS onto KICK should release GAS and press KICK.
      for (const a of previous) if (!next.includes(a)) this.set(a, false);
      for (const a of next) if (!previous.includes(a)) this.set(a, true);
      this.touchPointers.set(e.pointerId, next);
    };
    const pointerUp = (e: PointerEvent) => {
      const actions = this.touchPointers.get(e.pointerId);
      if (!actions) return;
      for (const a of actions) this.set(a, false);
      this.touchPointers.delete(e.pointerId);
    };
    this.surface.addEventListener('pointerdown', pointerDown, { passive: false });
    this.surface.addEventListener('pointermove', pointerMove, { passive: false });
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
    this.disposers.push(() => this.surface.removeEventListener('pointerdown', pointerDown));
    this.disposers.push(() => this.surface.removeEventListener('pointermove', pointerMove));
    this.disposers.push(() => window.removeEventListener('pointerup', pointerUp));
    this.disposers.push(() => window.removeEventListener('pointercancel', pointerUp));

    const onOrientation = (e: DeviceOrientationEvent) => {
      if (!this.options.tilt || e.gamma === null) return;
      const raw = clamp(e.gamma / this.options.tiltRange, -1, 1);
      this.tiltSteer = this.options.invertTilt ? -raw : raw;
    };
    window.addEventListener('deviceorientation', onOrientation);
    this.disposers.push(() => window.removeEventListener('deviceorientation', onOrientation));

    const onBlur = () => this.releaseAll();
    window.addEventListener('blur', onBlur);
    this.disposers.push(() => window.removeEventListener('blur', onBlur));
  }

  detach(): void {
    for (const dispose of this.disposers) dispose();
    this.disposers = [];
    this.releaseAll();
  }

  /** iOS requires a user gesture before it will hand over orientation data. */
  async requestTilt(): Promise<boolean> {
    const anyOrientation = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<'granted' | 'denied'>;
    };
    if (typeof anyOrientation?.requestPermission === 'function') {
      try {
        const result = await anyOrientation.requestPermission();
        if (result !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.options.tilt = true;
    return true;
  }

  private hitZones(e: PointerEvent): Action[] {
    const rect = this.surface.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const hits: Action[] = [];
    for (const zone of TOUCH_ZONES) {
      // Pad the hit box beyond the drawn button: thumbs are imprecise and a
      // missed throttle at 140km/h is the difference between fun and frustration.
      const pad = 0.025;
      if (
        fx >= zone.x - pad && fx <= zone.x + zone.w + pad &&
        fy >= zone.y - pad && fy <= zone.y + zone.h + pad
      ) {
        hits.push(zone.action);
      }
    }
    return hits;
  }

  private set(action: Action, down: boolean): void {
    if (down && !this.held[action]) this.pressedThisFrame[action] = true;
    this.held[action] = down;
  }

  private releaseAll(): void {
    for (const action of ACTIONS) this.held[action] = false;
    this.touchPointers.clear();
  }

  private pollGamepad(): void {
    const pads = navigator.getGamepads?.() ?? [];
    const pad = Array.from(pads).find((p) => p && p.connected);
    if (!pad) return;
    for (const [index, action] of Object.entries(PAD_MAP)) {
      const button = pad.buttons[Number(index)];
      if (button) this.set(action, button.pressed || button.value > 0.35);
    }
    const axis = pad.axes[0] ?? 0;
    if (Math.abs(axis) > 0.12) this.analogueSteer = clamp(axis, -1, 1);
    else if (Math.abs(this.analogueSteer) > 0) this.analogueSteer = 0;
    const rightTrigger = pad.buttons[7]?.value ?? 0;
    if (rightTrigger > 0.1) this.set('throttle', true);
  }

  /** Call once per rendered frame, before the simulation reads input. */
  sample(): InputSnapshot {
    this.pollGamepad();

    let steer = this.analogueSteer;
    if (steer === 0) {
      if (this.options.tilt && Math.abs(this.tiltSteer) > 0.06) steer = this.tiltSteer;
      else steer = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0);
    }

    const snapshot: InputSnapshot = {
      steer: clamp(steer, -1, 1),
      throttle: this.held.throttle ? 1 : 0,
      brake: this.held.brake ? 1 : 0,
      held: { ...this.held },
      pressed: { ...this.pressedThisFrame },
      touchActive: performance.now() - this.lastTouchAt < 4000,
    };
    this.consumed = this.pressedThisFrame;
    this.pressedThisFrame = emptyRecord();
    return snapshot;
  }

  /** Edge state from the most recent `sample()`, for code that runs after it. */
  wasPressed(action: Action): boolean {
    return this.consumed[action];
  }
}
