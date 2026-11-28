import { BALANCE } from '../data/balance';
import type { KeyBindings } from '../input/Keyboard';
import type { GameState, SimEvent } from '../sim/State';
import type { ControlHintsMode } from '../systems/Settings';

export type GuideSkillId = 'block' | 'parry' | 'jump' | 'dodge' | 'strike' | 'break' | 'special';
export type CalloutTone = 'info' | 'parry' | 'danger' | 'gold' | 'special';

export type CalloutSegment = { readonly text: string } | { readonly key: string };

export interface GuideCallout {
  readonly id: string;
  readonly tone: CalloutTone;
  readonly badge: string;
  readonly segments: readonly CalloutSegment[];
  readonly ttlFrames: number;
}

/** Converts a KeyboardEvent.code into a compact, readable keycap label. */
export function formatKeyCode(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num${code.slice(6)}`;
  const special: Record<string, string> = {
    Space: 'SPACE',
    ShiftLeft: 'SHIFT',
    ShiftRight: 'R-SHIFT',
    ControlLeft: 'CTRL',
    ControlRight: 'R-CTRL',
    AltLeft: 'ALT',
    AltRight: 'R-ALT',
    ArrowLeft: '←',
    ArrowRight: '→',
    ArrowUp: '↑',
    ArrowDown: '↓',
    Enter: 'ENTER',
    Backquote: '`',
  };
  return special[code] ?? code.toUpperCase();
}

/** Determines whether the on-screen combat guide should show for this mode and player history. */
export function shouldShowCombatGuide(
  hintsMode: ControlHintsMode,
  matchesPlayed: number,
  modeId: string,
): boolean {
  if (hintsMode === 'on') return true;
  if (hintsMode === 'off') return false;
  return matchesPlayed < 3 || modeId === 'training';
}

function keySeg(key: string): CalloutSegment {
  return { key };
}

function txtSeg(text: string): CalloutSegment {
  return { text };
}

/**
 * Selects the highest-priority contextual combat instruction from live game state
 * without interrupting gameplay.
 */
export function selectContextualCallout(
  state: GameState,
  events: readonly SimEvent[],
  keys: KeyBindings,
  touchActive: boolean,
  elapsedFrames: number,
): GuideCallout | null {
  if (state.phase !== 'fighting' && state.phase !== 'intro') {
    return null;
  }

  const [f0, f1] = state.fighters;
  const distPx = Math.abs(f1.x - f0.x) / BALANCE.FP_SCALE;

  const kBlock = touchActive ? 'PARRY' : formatKeyCode(keys.block);
  const kDodge = touchActive ? 'DODGE' : formatKeyCode(keys.dodge);
  const kJump = touchActive ? '↑' : formatKeyCode(keys.up);
  const kDown = formatKeyCode(keys.down);
  const kLeft = formatKeyCode(keys.left);
  const kRight = formatKeyCode(keys.right);
  const kLight = touchActive ? 'LIGHT' : formatKeyCode(keys.light);
  const kHeavy = touchActive ? 'HEAVY' : formatKeyCode(keys.heavy);
  const kGrab = touchActive ? 'GRAB' : formatKeyCode(keys.grab);
  const kSpecial = touchActive ? 'SPECIAL' : formatKeyCode(keys.special);

  const hasUnblockableTelegraph =
    events.some((ev) => ev.type === 'UNBLOCKABLE_TELEGRAPH' && ev.slot === 1) ||
    (f1.action === 'attack' && f1.currentMove === 'unblockable');

  if (hasUnblockableTelegraph) {
    return {
      id: 'unblockable',
      tone: 'danger',
      badge: 'RED ATTACK',
      ttlFrames: 80,
      segments: [
        txtSeg("Can't block! Press "),
        keySeg(kDodge),
        txtSeg(' Dodge or '),
        keySeg(kJump),
        txtSeg(' Jump'),
      ],
    };
  }

  const hasHazard =
    events.some(
      (ev) => ev.type === 'SLAB_TELEGRAPH' || ev.type === 'BOSS_SPECIAL_TELEGRAPH',
    ) ||
    state.hazards.some((h) => h.phase === 'telegraph' || h.phase === 'active') ||
    state.bossSpecials.length > 0;

  if (hasHazard) {
    return {
      id: 'hazard',
      tone: 'danger',
      badge: 'HAZARD',
      ttlFrames: 90,
      segments: [
        txtSeg('Watch the floor! '),
        keySeg(kJump),
        txtSeg(' Jump or '),
        keySeg(kDodge),
        txtSeg(' Dodge'),
      ],
    };
  }

  if (f0.specialMeter >= BALANCE.MAX_SPECIAL_METER) {
    return {
      id: 'special_ready',
      tone: 'special',
      badge: 'SPECIAL 100%',
      ttlFrames: 110,
      segments: [
        txtSeg('Press '),
        keySeg(kSpecial),
        txtSeg(' to unleash your Special Attack!'),
      ],
    };
  }

  if (f0.counterWindow > 0) {
    return {
      id: 'counter',
      tone: 'gold',
      badge: 'COUNTER',
      ttlFrames: 45,
      segments: [
        txtSeg('Counter open! Press '),
        keySeg(kLight),
        txtSeg(' or '),
        keySeg(kHeavy),
        txtSeg(' now'),
      ],
    };
  }

  if (f1.action === 'guard_break') {
    return {
      id: 'guard_break',
      tone: 'gold',
      badge: 'GUARD BROKEN',
      ttlFrames: 65,
      segments: [
        txtSeg('Foe stunned! Press '),
        keySeg(kGrab),
        txtSeg(' to Execute or '),
        keySeg(kHeavy),
        txtSeg(' Heavy'),
      ],
    };
  }

  const incomingNormal =
    f1.action === 'attack' &&
    f1.currentMove !== null &&
    f1.currentMove !== 'unblockable' &&
    f1.currentMove !== 'grab' &&
    distPx <= 260;

  if (incomingNormal) {
    return {
      id: 'incoming_strike',
      tone: 'parry',
      badge: 'INCOMING',
      ttlFrames: 75,
      segments: touchActive
        ? [txtSeg('Tap '), keySeg('PARRY'), txtSeg(' on hit to Parry, or hold to Block')]
        : [
            txtSeg('Tap '),
            keySeg(kBlock),
            txtSeg(' on hit to Parry (+Special) or hold '),
            keySeg(kBlock),
            txtSeg(' to Block'),
          ],
    };
  }

  if (f1.action === 'block' && distPx <= 190) {
    return {
      id: 'foe_blocking',
      tone: 'gold',
      badge: 'FOE BLOCKING',
      ttlFrames: 75,
      segments: touchActive
        ? [txtSeg('Open guard with '), keySeg('BREAK'), txtSeg(' or '), keySeg('GRAB')]
        : [
            txtSeg('Break guard: '),
            keySeg(kDown),
            txtSeg('+'),
            keySeg(kHeavy),
            txtSeg(' Unblockable or '),
            keySeg(kGrab),
            txtSeg(' Grab'),
          ],
    };
  }

  if (f0.action === 'block' && f0.guard < 35) {
    return {
      id: 'low_guard',
      tone: 'parry',
      badge: 'GUARD LOW',
      ttlFrames: 75,
      segments: [
        txtSeg('Guard cracking! '),
        keySeg(kDodge),
        txtSeg(' Dodge out or tap '),
        keySeg(kBlock),
        txtSeg(' to Parry'),
      ],
    };
  }

  // Calm rotating fundamentals during neutral
  const cycle = Math.floor(elapsedFrames / 300) % 4;
  if (cycle === 0) {
    return {
      id: 'tip_basics',
      tone: 'info',
      badge: 'COMBAT',
      ttlFrames: 60,
      segments: touchActive
        ? [
            txtSeg('Stick to Move/Jump · '),
            keySeg('LIGHT'),
            txtSeg(' 4-hit combo · '),
            keySeg('HEAVY'),
            txtSeg(' slash'),
          ]
        : [
            keySeg(kLeft),
            txtSeg('/'),
            keySeg(kRight),
            txtSeg(' Move · '),
            keySeg(kJump),
            txtSeg(' Jump · '),
            keySeg(kLight),
            txtSeg('/LMB Light · '),
            keySeg(kHeavy),
            txtSeg('/RMB Heavy'),
          ],
    };
  }
  if (cycle === 1) {
    return {
      id: 'tip_block_parry',
      tone: 'parry',
      badge: 'DEFENSE',
      ttlFrames: 60,
      segments: touchActive
        ? [
            txtSeg('Hold '),
            keySeg('PARRY'),
            txtSeg(' to Block · Tap right before impact to Parry & gain Special'),
          ]
        : [
            txtSeg('Hold '),
            keySeg(kBlock),
            txtSeg(' to Block · Tap '),
            keySeg(kBlock),
            txtSeg(' right before impact to Parry (+Special)'),
          ],
    };
  }
  if (cycle === 2) {
    return {
      id: 'tip_dodge',
      tone: 'info',
      badge: 'EVADE',
      ttlFrames: 60,
      segments: [
        txtSeg('Press '),
        keySeg(kDodge),
        txtSeg(' to Dodge through attacks · Last-moment Dodge slows foe!'),
      ],
    };
  }
  return {
    id: 'tip_special',
    tone: 'special',
    badge: 'POWERS',
    ttlFrames: 60,
    segments: touchActive
      ? [
          keySeg('BREAK'),
          txtSeg(' shatters guard · '),
          keySeg('GRAB'),
          txtSeg(' beats block · '),
          keySeg('SPECIAL'),
          txtSeg(' at 100%'),
        ]
      : [
          keySeg(kDown),
          txtSeg('+'),
          keySeg(kHeavy),
          txtSeg(' Unblockable · '),
          keySeg(kGrab),
          txtSeg(' Grab · '),
          keySeg(kSpecial),
          txtSeg(' Special at 100% meter'),
        ],
  };
}

interface StripItemSpec {
  readonly skill: GuideSkillId;
  readonly label: string;
  readonly sub: string;
  readonly keys: (k: KeyBindings) => readonly string[];
  readonly joinPlus?: boolean;
}

const STRIP_ITEMS: readonly StripItemSpec[] = [
  {
    skill: 'block',
    label: 'Block',
    sub: 'hold',
    keys: (k) => [formatKeyCode(k.block)],
  },
  {
    skill: 'parry',
    label: 'Parry',
    sub: 'tap hit',
    keys: (k) => [formatKeyCode(k.block)],
  },
  {
    skill: 'jump',
    label: 'Jump',
    sub: 'lows',
    keys: (k) => [formatKeyCode(k.up)],
  },
  {
    skill: 'dodge',
    label: 'Dodge',
    sub: 'evade',
    keys: (k) => [formatKeyCode(k.dodge)],
  },
  {
    skill: 'strike',
    label: 'Attack',
    sub: 'light/heavy',
    keys: (k) => [formatKeyCode(k.light), formatKeyCode(k.heavy)],
  },
  {
    skill: 'break',
    label: 'Break / Grab',
    sub: 'vs guard',
    keys: (k) => [`${formatKeyCode(k.down)}+${formatKeyCode(k.heavy)}`, formatKeyCode(k.grab)],
  },
  {
    skill: 'special',
    label: 'Special',
    sub: '100% bar',
    keys: (k) => [formatKeyCode(k.special)],
  },
];

/**
 * Non-intrusive on-screen instruction overlay for new players and Training Dojo.
 * Purely visual (`pointer-events: none`) so it never steals focus or interrupts combat.
 */
export class CombatGuideView {
  private readonly root: HTMLDivElement;
  private readonly calloutEl: HTMLDivElement;
  private readonly stripEl: HTMLDivElement;
  private readonly itemEls = new Map<GuideSkillId, HTMLDivElement>();
  private readonly mastered = new Set<GuideSkillId>();

  private keys: KeyBindings;
  private visible = false;
  private touchActive = false;
  private activeCallout: GuideCallout | null = null;
  private calloutFramesLeft = 0;
  private elapsedFrames = 0;
  private lastCalloutRenderKey = '';
  private lastMasteredSig = '';
  private lastCinematic = false;
  private lastKeysSig = '';

  constructor(uiRoot: HTMLElement, initialKeys: KeyBindings) {
    this.keys = { ...initialKeys };

    this.root = document.createElement('div');
    this.root.className = 'combat-guide';
    this.root.setAttribute('aria-hidden', 'true');

    this.calloutEl = document.createElement('div');
    this.calloutEl.className = 'combat-guide-callout';

    this.stripEl = document.createElement('div');
    this.stripEl.className = 'combat-guide-strip';

    this.root.append(this.calloutEl, this.stripEl);
    uiRoot.appendChild(this.root);
    this.rebuildStrip();
  }

  /** Resets per-match callout state and shows or hides the guide for the launched match. */
  public configureForMatch(show: boolean, keys: KeyBindings, touchActive: boolean): void {
    this.keys = { ...keys };
    this.touchActive = touchActive;
    this.activeCallout = null;
    this.calloutFramesLeft = 0;
    this.elapsedFrames = 0;
    this.lastCalloutRenderKey = '';
    this.setTouchMode(touchActive);
    this.setVisible(show);
    this.rebuildStripIfNeeded();
  }

  public setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.style.display = visible ? 'flex' : 'none';
  }

  public setKeyBindings(keys: KeyBindings): void {
    this.keys = { ...keys };
    this.rebuildStripIfNeeded();
    this.lastCalloutRenderKey = '';
  }

  public setTouchMode(active: boolean): void {
    this.touchActive = active;
    this.root.classList.toggle('with-touch', active);
    this.stripEl.style.display = active ? 'none' : 'flex';
    this.lastCalloutRenderKey = '';
  }

  /** Records simulation events & player actions to highlight practiced mechanics and surface contextual tips. */
  public onSimStep(state: GameState, events: readonly SimEvent[]): void {
    if (!this.visible) return;
    this.elapsedFrames += 1;

    const f0 = state.fighters[0];
    if (f0.action === 'block') this.mastered.add('block');
    if (f0.action === 'jump') this.mastered.add('jump');

    for (const ev of events) {
      if (ev.type === 'BLOCK' && ev.defender === 0) this.mastered.add('block');
      else if (ev.type === 'PARRY' && ev.parrier === 0) this.mastered.add('parry');
      else if (
        (ev.type === 'DODGE' && ev.slot === 0) ||
        (ev.type === 'PERFECT_DODGE' && ev.dodger === 0)
      ) {
        this.mastered.add('dodge');
      } else if (
        (ev.type === 'HIT' && ev.attacker === 0) ||
        (ev.type === 'ATTACK_START' &&
          ev.slot === 0 &&
          (ev.move === 'light1' || ev.move === 'heavy'))
      ) {
        this.mastered.add('strike');
      } else if (
        (ev.type === 'ATTACK_START' &&
          ev.slot === 0 &&
          (ev.move === 'unblockable' || ev.move === 'grab')) ||
        (ev.type === 'GUARD_BREAK' && ev.victim === 1)
      ) {
        this.mastered.add('break');
      } else if (ev.type === 'PLAYER_SPECIAL_START' && ev.attacker === 0) {
        this.mastered.add('special');
      }
    }

    if (this.calloutFramesLeft > 0) {
      this.calloutFramesLeft -= 1;
    }

    const candidate = selectContextualCallout(
      state,
      events,
      this.keys,
      this.touchActive,
      this.elapsedFrames,
    );

    if (candidate === null) {
      this.activeCallout = null;
      this.calloutFramesLeft = 0;
      return;
    }

    const urgentIds = new Set(['unblockable', 'hazard', 'special_ready', 'counter', 'guard_break']);
    const isUrgent = urgentIds.has(candidate.id);
    const currentIsUrgent = this.activeCallout !== null && urgentIds.has(this.activeCallout.id);

    if (
      this.activeCallout === null ||
      this.calloutFramesLeft <= 0 ||
      (isUrgent && !currentIsUrgent) ||
      candidate.id === this.activeCallout.id
    ) {
      this.activeCallout = candidate;
      this.calloutFramesLeft = candidate.ttlFrames;
    }
  }

  /** Syncs DOM only when visible callout, mastered skills, or cinematic state actually changes. */
  public updateView(state: GameState): void {
    if (!this.visible) return;

    const cinematic =
      state.phase === 'finisher' ||
      state.phase === 'special' ||
      state.phase === 'round_end' ||
      state.phase === 'match_end';
    if (cinematic !== this.lastCinematic) {
      this.lastCinematic = cinematic;
      this.root.dataset.cinematic = cinematic ? 'true' : 'false';
    }

    const masteredSig = Array.from(this.mastered).sort().join(',');
    if (masteredSig !== this.lastMasteredSig) {
      this.lastMasteredSig = masteredSig;
      for (const [skill, el] of this.itemEls) {
        el.dataset.done = this.mastered.has(skill) ? 'true' : 'false';
      }
    }

    const renderKey = this.activeCallout
      ? `${this.activeCallout.id}:${this.activeCallout.tone}:${this.touchActive ? 'T' : 'K'}:${this.lastKeysSig}`
      : 'none';
    if (renderKey !== this.lastCalloutRenderKey) {
      this.lastCalloutRenderKey = renderKey;
      this.renderCallout(this.activeCallout);
    }
  }

  private renderCallout(callout: GuideCallout | null): void {
    if (!callout) {
      this.calloutEl.style.display = 'none';
      return;
    }
    this.calloutEl.style.display = 'inline-flex';
    this.calloutEl.dataset.tone = callout.tone;
    this.calloutEl.textContent = '';

    const badge = document.createElement('span');
    badge.className = 'cg-badge';
    badge.textContent = callout.badge;

    const textWrap = document.createElement('span');
    textWrap.className = 'cg-msg';
    for (const seg of callout.segments) {
      if ('key' in seg) {
        const kbd = document.createElement('kbd');
        kbd.className = 'cg-kbd';
        kbd.textContent = seg.key;
        textWrap.appendChild(kbd);
      } else {
        textWrap.appendChild(document.createTextNode(seg.text));
      }
    }

    this.calloutEl.append(badge, textWrap);
  }

  private rebuildStripIfNeeded(): void {
    const sig = Object.values(this.keys).join('|');
    if (sig === this.lastKeysSig) return;
    this.lastKeysSig = sig;
    this.rebuildStrip();
  }

  private rebuildStrip(): void {
    this.lastKeysSig = Object.values(this.keys).join('|');
    this.stripEl.textContent = '';
    this.itemEls.clear();

    for (const spec of STRIP_ITEMS) {
      const item = document.createElement('div');
      item.className = 'cg-item';
      item.dataset.done = this.mastered.has(spec.skill) ? 'true' : 'false';

      const keysWrap = document.createElement('span');
      keysWrap.className = 'cg-keys';
      const labels = spec.keys(this.keys);
      labels.forEach((lbl, idx) => {
        if (idx > 0) {
          const sep = document.createElement('span');
          sep.className = 'cg-sep';
          sep.textContent = '/';
          keysWrap.appendChild(sep);
        }
        const kbd = document.createElement('kbd');
        kbd.className = 'cg-kbd';
        kbd.textContent = lbl;
        keysWrap.appendChild(kbd);
      });

      const copy = document.createElement('span');
      copy.className = 'cg-copy';
      const title = document.createElement('span');
      title.className = 'cg-label';
      title.textContent = spec.label;
      const sub = document.createElement('span');
      sub.className = 'cg-sub';
      sub.textContent = spec.sub;
      copy.append(title, sub);

      const check = document.createElement('span');
      check.className = 'cg-check';
      check.textContent = '✓';

      item.append(keysWrap, copy, check);
      this.itemEls.set(spec.skill, item);
      this.stripEl.appendChild(item);
    }
  }

  public dispose(): void {
    this.root.remove();
  }
}
