import { INPUT_BITS, type InputBitfield } from './InputFrame';

export interface JoystickState {
  readonly bits: InputBitfield;
  readonly knobX: number;
  readonly knobY: number;
  readonly active: boolean;
  readonly up: boolean;
  readonly down: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

const JOYSTICK_DEADZONE = 0.22;
const VERTICAL_PURE_THRESHOLD = 0.26;
const VERTICAL_DIAG_THRESHOLD = 0.34;

/**
 * Pure 8-way fighting-game joystick evaluator with generous horizontal walking cones
 * so moving left/right never causes accidental jumps or crouches.
 */
export function computeJoystickState(dx: number, dy: number, maxRadius: number): JoystickState {
  if (maxRadius <= 0 || !Number.isFinite(dx) || !Number.isFinite(dy)) {
    return { bits: 0, knobX: 0, knobY: 0, active: false, up: false, down: false, left: false, right: false };
  }

  const dist = Math.hypot(dx, dy);
  const scale = dist > maxRadius ? maxRadius / dist : 1;
  const knobX = dx * scale;
  const knobY = dy * scale;
  const norm = dist / maxRadius;

  if (norm < JOYSTICK_DEADZONE) {
    return { bits: 0, knobX, knobY, active: false, up: false, down: false, left: false, right: false };
  }

  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  const absDeg = Math.abs(deg);

  const right = absDeg <= 66;
  const left = absDeg >= 114;

  const isPureUp = deg > -114 && deg < -66;
  const isDiagUp = (deg >= -148 && deg <= -114) || (deg >= -66 && deg <= -32);
  const up = (isPureUp && norm >= VERTICAL_PURE_THRESHOLD) || (isDiagUp && norm >= VERTICAL_DIAG_THRESHOLD);

  const isPureDown = deg > 66 && deg < 114;
  const isDiagDown = (deg >= 114 && deg <= 148) || (deg >= 32 && deg <= 66);
  const down = (isPureDown && norm >= VERTICAL_PURE_THRESHOLD) || (isDiagDown && norm >= VERTICAL_DIAG_THRESHOLD);

  let bits = 0;
  if (left) bits |= INPUT_BITS.LEFT;
  if (right) bits |= INPUT_BITS.RIGHT;
  if (up) bits |= INPUT_BITS.UP;
  if (down) bits |= INPUT_BITS.DOWN;

  return {
    bits,
    knobX,
    knobY,
    active: bits !== 0,
    up,
    down,
    left,
    right,
  };
}

interface ActionButtonSpec {
  readonly id: string;
  readonly label: string;
  readonly ariaLabel: string;
  readonly bit: number;
  readonly iconSvg: string;
}

const ACTION_BUTTONS: readonly ActionButtonSpec[] = [
  {
    id: 'light',
    label: 'LIGHT',
    ariaLabel: 'Light Slash',
    bit: INPUT_BITS.LIGHT,
    iconSvg:
      '<path d="M5 19L19 5M14 4h6v6M8 14l4 4" stroke-width="2.2"/><path d="M6 9a9 9 0 0 1 9-5" stroke-width="1.5" opacity="0.8"/>',
  },
  {
    id: 'heavy',
    label: 'HEAVY',
    ariaLabel: 'Heavy Slash',
    bit: INPUT_BITS.HEAVY,
    iconSvg:
      '<path d="M4 20L18 6l2-2-2 2M13 5l6 6M7 13l4 4" stroke-width="2.4"/><path d="M4 11c2-4 6-7 11-7" stroke-width="1.7" opacity="0.85"/><path d="M10 20c4-1 7-4 9-8" stroke-width="1.6" opacity="0.7"/>',
  },
  {
    id: 'parry',
    label: 'PARRY',
    ariaLabel: 'Parry / Hold to Block',
    bit: INPUT_BITS.BLOCK,
    iconSvg:
      '<path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3Z" stroke-width="2"/><path d="M12 7v6m-3-3h6" stroke-width="2" opacity="0.9"/>',
  },
  {
    id: 'dodge',
    label: 'DODGE',
    ariaLabel: 'Dodge / Perfect Dodge',
    bit: INPUT_BITS.DODGE,
    iconSvg:
      '<path d="M4 12h8M6 8h5M5 16h6" stroke-width="2"/><path d="M13 6l6 6-6 6" stroke-width="2.3"/>',
  },
  {
    id: 'break',
    label: 'BREAK',
    ariaLabel: 'Unblockable Guard Break',
    bit: INPUT_BITS.UNBLOCKABLE,
    iconSvg:
      '<path d="M12 3l7 3v5c0 3.7-2 6.8-5 8.8M5 6l7-3M5 6v5c0 3.7 2 6.8 5 8.8" stroke-width="1.9"/><path d="M13.5 6.5L9.5 12h4l-3 5.5" stroke-width="2.2"/>',
  },
  {
    id: 'grab',
    label: 'GRAB',
    ariaLabel: 'Grab / Execute',
    bit: INPUT_BITS.GRAB,
    iconSvg:
      '<path d="M7 11V7a1.5 1.5 0 0 1 3 0v3m0-3.5a1.5 1.5 0 0 1 3 0V10m0-3a1.5 1.5 0 0 1 3 0v4m0-1.5a1.5 1.5 0 0 1 3 0v3.5c0 4-3 7-7 7h-1c-3.5 0-6-2.5-6-6v-3a1.5 1.5 0 0 1 2-1.4" stroke-width="1.9"/>',
  },
  {
    id: 'special',
    label: 'SPECIAL',
    ariaLabel: 'Special Power',
    bit: INPUT_BITS.SPECIAL,
    iconSvg:
      '<path d="M12 2l2.4 5.6L20 10l-5.6 2.4L12 18l-2.4-5.6L4 10l5.6-2.4L12 2Z" stroke-width="2"/><path d="M12 6v8M8 10h8" stroke-width="1.6" opacity="0.85"/>',
  },
];

const EXPAND_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
const COMPRESS_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M10 14l-7 7"/></svg>';
const PAUSE_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>';

/**
 * Multi-pointer mobile combat controls:
 * - Bottom-left 8-way fighting joystick (Left, Right, Jump, Crouch)
 * - Bottom-right ergonomic combat arc with game icons (Light, Heavy, Parry, Dodge, Break, Grab, Special)
 * - Top-corner utility buttons (Fullscreen & Pause)
 */
export class TouchInput {
  private readonly container = document.createElement('div');
  private readonly joystickZone = document.createElement('div');
  private readonly joystickBase = document.createElement('div');
  private readonly joystickKnob = document.createElement('div');
  private readonly dirIndicators: Record<'up' | 'down' | 'left' | 'right', HTMLSpanElement>;
  private readonly heldButtons = new Map<number, { bit: number; el: HTMLButtonElement }>();
  private readonly actionElements = new Map<string, HTMLButtonElement>();
  private readonly specialFillEl = document.createElement('span');
  private readonly fullscreenBtn = document.createElement('button');
  private readonly pauseBtn = document.createElement('button');

  private joystickPointerId: number | null = null;
  private joystickBits: InputBitfield = 0;
  private visible = false;

  public onPause: () => void = () => {};
  public onToggleFullscreen: () => void = () => {};

  public readonly clear = (): void => {
    this.joystickPointerId = null;
    this.joystickBits = 0;
    this.resetJoystickVisual();
    this.heldButtons.clear();
    this.container.querySelectorAll('[data-held]').forEach((el) => el.removeAttribute('data-held'));
  };

  private readonly preventContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  constructor(host: HTMLElement) {
    this.container.className = 'touch-controls';
    this.container.addEventListener('contextmenu', this.preventContextMenu);

    // Top-left Fullscreen toggle button
    this.fullscreenBtn.type = 'button';
    this.fullscreenBtn.className = 'touch-utility-btn touch-fullscreen interactive';
    this.fullscreenBtn.setAttribute('aria-label', 'Toggle fullscreen landscape');
    this.fullscreenBtn.innerHTML = `${EXPAND_SVG}<span>FULL</span>`;
    this.fullscreenBtn.onclick = () => this.onToggleFullscreen();

    // Top-right Pause button
    this.pauseBtn.type = 'button';
    this.pauseBtn.className = 'touch-utility-btn touch-pause interactive';
    this.pauseBtn.setAttribute('aria-label', 'Pause fight');
    this.pauseBtn.innerHTML = `${PAUSE_SVG}<span>PAUSE</span>`;
    this.pauseBtn.onclick = () => this.onPause();

    // Bottom-left Virtual Joystick
    this.joystickZone.className = 'touch-joystick-zone interactive';
    this.joystickZone.setAttribute('role', 'application');
    this.joystickZone.setAttribute('aria-label', 'Movement joystick: left, right, up to jump, down to crouch');
    this.joystickBase.className = 'touch-joystick-base';

    const ring = document.createElement('span');
    ring.className = 'touch-joystick-ring';
    ring.setAttribute('aria-hidden', 'true');
    this.joystickBase.appendChild(ring);

    const makeDir = (dir: 'up' | 'down' | 'left' | 'right', path: string): HTMLSpanElement => {
      const span = document.createElement('span');
      span.className = `touch-joystick-dir dir-${dir}`;
      span.setAttribute('aria-hidden', 'true');
      span.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${path}"/></svg>`;
      this.joystickBase.appendChild(span);
      return span;
    };

    this.dirIndicators = {
      up: makeDir('up', 'M4 10l4-4 4 4'),
      down: makeDir('down', 'M4 6l4 4 4-4'),
      left: makeDir('left', 'M10 4L6 8l4 4'),
      right: makeDir('right', 'M6 4l4 4-4 4'),
    };

    this.joystickKnob.className = 'touch-joystick-knob';
    this.joystickKnob.setAttribute('aria-hidden', 'true');
    this.joystickKnob.innerHTML = '<span class="touch-joystick-core"></span>';
    this.joystickBase.appendChild(this.joystickKnob);
    this.joystickZone.appendChild(this.joystickBase);

    this.bindJoystickEvents();

    // Bottom-right Action Cluster
    const actionsCluster = document.createElement('div');
    actionsCluster.className = 'touch-actions-cluster';

    for (const spec of ACTION_BUTTONS) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `touch-btn touch-btn-${spec.id} interactive`;
      button.dataset.touch = spec.id;
      button.setAttribute('aria-label', spec.ariaLabel);

      if (spec.id === 'special') {
        this.specialFillEl.className = 'touch-special-fill';
        this.specialFillEl.setAttribute('aria-hidden', 'true');
        button.appendChild(this.specialFillEl);
      }

      const iconWrap = document.createElement('span');
      iconWrap.className = 'touch-btn-icon';
      iconWrap.setAttribute('aria-hidden', 'true');
      iconWrap.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">${spec.iconSvg}</svg>`;

      const text = document.createElement('span');
      text.className = 'touch-btn-label';
      text.textContent = spec.label;

      button.append(iconWrap, text);

      button.onpointerdown = (event) => {
        event.preventDefault();
        if (!this.visible) return;
        try {
          button.setPointerCapture(event.pointerId);
        } catch {
          // Ignore synthetic events without active pointer
        }
        this.heldButtons.set(event.pointerId, { bit: spec.bit, el: button });
        button.dataset.held = 'true';
      };

      const releaseBtn = (event: PointerEvent) => {
        const entry = this.heldButtons.get(event.pointerId);
        if (!entry) return;
        this.heldButtons.delete(event.pointerId);
        const stillHeld = [...this.heldButtons.values()].some((v) => v.el === entry.el);
        if (!stillHeld) {
          delete entry.el.dataset.held;
        }
      };

      button.onpointerup = releaseBtn;
      button.onpointercancel = releaseBtn;
      button.onlostpointercapture = releaseBtn;

      this.actionElements.set(spec.id, button);
      actionsCluster.appendChild(button);
    }

    this.container.append(this.fullscreenBtn, this.pauseBtn, this.joystickZone, actionsCluster);
    host.appendChild(this.container);
    this.setVisible(false);

    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  private bindJoystickEvents(): void {
    const updateFromPointer = (clientX: number, clientY: number) => {
      const rect = this.joystickBase.getBoundingClientRect();
      const width = rect.width > 0 ? rect.width : 124;
      const cx = rect.left + width * 0.5;
      const cy = rect.top + (rect.height > 0 ? rect.height : width) * 0.5;
      const maxRadius = width * 0.42;

      const state = computeJoystickState(clientX - cx, clientY - cy, maxRadius);
      this.joystickBits = state.bits;
      this.joystickKnob.style.transform = `translate3d(${state.knobX.toFixed(1)}px, ${state.knobY.toFixed(1)}px, 0)`;
      this.joystickBase.dataset.active = state.active ? 'true' : 'false';
      this.dirIndicators.up.dataset.lit = state.up ? 'true' : 'false';
      this.dirIndicators.down.dataset.lit = state.down ? 'true' : 'false';
      this.dirIndicators.left.dataset.lit = state.left ? 'true' : 'false';
      this.dirIndicators.right.dataset.lit = state.right ? 'true' : 'false';
    };

    this.joystickZone.onpointerdown = (event) => {
      event.preventDefault();
      if (!this.visible || this.joystickPointerId !== null) return;
      this.joystickPointerId = event.pointerId;
      try {
        this.joystickZone.setPointerCapture(event.pointerId);
      } catch {
        // Ignore synthetic event environments
      }
      this.joystickKnob.dataset.dragging = 'true';
      updateFromPointer(event.clientX, event.clientY);
    };

    this.joystickZone.onpointermove = (event) => {
      if (event.pointerId !== this.joystickPointerId || !this.visible) return;
      event.preventDefault();
      updateFromPointer(event.clientX, event.clientY);
    };

    const releaseJoystick = (event: PointerEvent) => {
      if (event.pointerId !== this.joystickPointerId) return;
      this.joystickPointerId = null;
      this.joystickBits = 0;
      this.resetJoystickVisual();
    };

    this.joystickZone.onpointerup = releaseJoystick;
    this.joystickZone.onpointercancel = releaseJoystick;
    this.joystickZone.onlostpointercapture = releaseJoystick;
  }

  private resetJoystickVisual(): void {
    delete this.joystickKnob.dataset.dragging;
    this.joystickKnob.style.transform = 'translate3d(0px, 0px, 0)';
    delete this.joystickBase.dataset.active;
    for (const dir of Object.values(this.dirIndicators)) {
      delete dir.dataset.lit;
    }
  }

  public configure(size: 'normal' | 'large', opacity: number): void {
    this.container.dataset.size = size;
    this.container.style.setProperty('--touch-opacity', String(opacity));
  }

  public setFullscreenState(active: boolean): void {
    this.fullscreenBtn.innerHTML = `${active ? COMPRESS_SVG : EXPAND_SVG}<span>${active ? 'EXIT' : 'FULL'}</span>`;
    this.fullscreenBtn.dataset.active = active ? 'true' : 'false';
  }

  public updateHudFeedback(specialMeter: number, counterReady: boolean): void {
    const clamped = Math.max(0, Math.min(100, specialMeter));
    this.specialFillEl.style.height = `${clamped}%`;
    const specialBtn = this.actionElements.get('special');
    if (specialBtn) {
      if (clamped >= 100) specialBtn.dataset.ready = 'true';
      else delete specialBtn.dataset.ready;
    }
    const lightBtn = this.actionElements.get('light');
    const heavyBtn = this.actionElements.get('heavy');
    if (lightBtn) {
      if (counterReady) lightBtn.dataset.counter = 'true';
      else delete lightBtn.dataset.counter;
    }
    if (heavyBtn) {
      if (counterReady) heavyBtn.dataset.counter = 'true';
      else delete heavyBtn.dataset.counter;
    }
  }

  public setVisible(show: boolean): void {
    this.visible = show;
    this.container.hidden = !show;
    if (!show) this.clear();
  }

  public sample(): InputBitfield {
    if (!this.visible) return 0;
    let bits = this.joystickBits;
    for (const entry of this.heldButtons.values()) {
      bits |= entry.bit;
    }
    return bits;
  }

  public dispose(): void {
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
    this.container.removeEventListener('contextmenu', this.preventContextMenu);
    this.clear();
    this.container.remove();
  }
}
