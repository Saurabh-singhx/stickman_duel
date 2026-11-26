import { INPUT_BITS, type InputBitfield } from './InputFrame';

const BUTTONS = [
  ['Left', INPUT_BITS.LEFT], ['Jump', INPUT_BITS.UP], ['Right', INPUT_BITS.RIGHT],
  ['Crouch', INPUT_BITS.DOWN], ['Dodge', INPUT_BITS.DODGE],
  ['Light', INPUT_BITS.LIGHT], ['Heavy', INPUT_BITS.HEAVY], ['Parry', INPUT_BITS.BLOCK],
  ['Grab', INPUT_BITS.GRAB], ['Special', INPUT_BITS.SPECIAL], ['Break', INPUT_BITS.UNBLOCKABLE],
] as const;

/** Multi-pointer combat controls; capture keeps held inputs stable under thumb drift. */
export class TouchInput {
  private readonly container = document.createElement('div');
  private readonly held = new Map<number, number>();
  private visible = false;
  private readonly clear = () => {
    this.held.clear();
    this.container.querySelectorAll('[data-held]').forEach(el => el.removeAttribute('data-held'));
  };
  public onPause: () => void = () => {};

  constructor(host: HTMLElement) {
    this.container.className = 'touch-controls';
    const pause = document.createElement('button');
    pause.type = 'button';
    pause.className = 'touch-pause';
    pause.textContent = 'Pause';
    pause.onclick = () => this.onPause();
    const movement = document.createElement('div');
    movement.className = 'touch-pad touch-movement';
    const attacks = document.createElement('div');
    attacks.className = 'touch-pad touch-attacks';
    BUTTONS.forEach(([name, bit], index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = name;
      button.dataset.touch = name.toLowerCase();
      button.setAttribute('aria-label', name === 'Parry' ? 'Parry / hold to block' : name);
      button.onpointerdown = event => {
        event.preventDefault();
        if (!this.visible) return;
        button.setPointerCapture(event.pointerId);
        this.held.set(event.pointerId, bit);
        button.dataset.held = 'true';
      };
      const release = (event: PointerEvent) => {
        this.held.delete(event.pointerId);
        if (![...this.held.values()].includes(bit)) delete button.dataset.held;
      };
      button.onpointerup = release;
      button.onpointercancel = release;
      button.onlostpointercapture = release;
      (index < 5 ? movement : attacks).appendChild(button);
    });
    this.container.append(pause, movement, attacks);
    host.appendChild(this.container);
    this.setVisible(false);
    window.addEventListener('blur', this.clear);
    document.addEventListener('visibilitychange', this.clear);
  }

  public configure(size: 'normal' | 'large', opacity: number): void {
    this.container.dataset.size = size;
    this.container.style.setProperty('--touch-opacity', String(opacity));
  }
  public setVisible(show: boolean): void {
    this.visible = show;
    this.container.hidden = !show;
    if (!show) this.clear();
  }
  public sample(): InputBitfield {
    return this.visible ? [...this.held.values()].reduce((bits, bit) => bits | bit, 0) : 0;
  }
  public dispose(): void {
    window.removeEventListener('blur', this.clear);
    document.removeEventListener('visibilitychange', this.clear);
    this.clear();
    this.container.remove();
  }
}
