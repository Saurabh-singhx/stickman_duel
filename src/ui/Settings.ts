import { panelFocus } from './PanelFocus';
import type { InputAction } from '../input/InputFrame';
import type { UserSettings } from '../systems/Settings';

/**
 * Settings modal for audio volumes, accessibility toggles, quality, key rebinding, and feature flags.
 */
export class SettingsView {
  private readonly root: HTMLDivElement;
  private focusPanel: (visible: boolean) => void = () => {};
  private cancelRebind: (() => void) | null = null;
  private settings: UserSettings;
  private readonly onChange: (next: UserSettings) => void;
  private readonly onClose: () => void;

  constructor(
    uiRoot: HTMLElement,
    initial: UserSettings,
    onChange: (next: UserSettings) => void,
    onClose: () => void,
  ) {
    this.settings = initial;
    this.onChange = onChange;
    this.onClose = onClose;
    this.root = document.createElement('div');
    this.root.className = 'settings-overlay interactive';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(14,13,11,0.82);z-index:40;';
    uiRoot.appendChild(this.root);
    this.render();
    this.focusPanel = panelFocus(this.root, this.onClose);
  }

  public setVisible(visible: boolean, latest?: UserSettings): void {
    this.cancelRebind?.();
    if (latest) this.settings = latest;
    this.root.style.display = visible ? 'flex' : 'none';
    if (visible) this.render();
    this.focusPanel(visible);
  }

  private update(patch: Partial<UserSettings>): void {
    this.settings = { ...this.settings, ...patch };
    this.onChange(this.settings);
  }

  private render(): void {
    this.root.textContent = '';
    const card = document.createElement('div');
    card.className = 'game-panel';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Settings and accessibility');
    card.style.cssText =
      'width:min(560px, calc(100% - 32px));max-height:86vh;overflow:auto;background:#1c1a17;border:1px solid rgba(245,200,76,0.45);border-radius:10px;padding:22px;display:flex;flex-direction:column;gap:12px;';

    const title = document.createElement('h2');
    title.textContent = 'Make it your fight';
    title.style.cssText = 'letter-spacing:3px;font-size:18px;color:#ffd54f;';
    card.appendChild(title);

    const note = document.createElement('p');
    note.textContent = 'Audio, visuals and controls. Changes save automatically.';
    card.appendChild(note);

    const section = (name: string) => {
      const heading = document.createElement('h3');
      heading.className = 'settings-section';
      heading.textContent = name;
      card.appendChild(heading);
    };
    section('Audio');
    // Volume sliders
    const addSlider = (label: string, key: 'master' | 'music' | 'sfx') => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;';
      const span = document.createElement('span');
      span.textContent = `${label}: ${Math.round(this.settings.volumes[key] * 100)}%`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = '0';
      input.max = '100';
      input.value = String(Math.round(this.settings.volumes[key] * 100));
      input.oninput = () => {
        const val = Number(input.value) / 100;
        span.textContent = `${label}: ${Math.round(val * 100)}%`;
        this.update({ volumes: { ...this.settings.volumes, [key]: val } });
      };
      row.append(span, input);
      card.appendChild(row);
    };

    addSlider('Master Volume', 'master');
    addSlider('Music Volume', 'music');
    addSlider('SFX Volume', 'sfx');

    // Boolean toggles
    const addToggle = (label: string, checked: boolean, onToggle: (v: boolean) => void) => {
      const row = document.createElement('label');
      row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;font-size:13px;cursor:pointer;';
      const span = document.createElement('span');
      span.textContent = label;
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = checked;
      box.onchange = () => onToggle(box.checked);
      row.append(span, box);
      card.appendChild(row);
    };

    section('Visuals & accessibility');
    addToggle('Screen Shake', this.settings.screenShake, (v) => this.update({ screenShake: v }));
    addToggle('Hero Glow / Bloom', this.settings.glowEnabled, (v) => this.update({ glowEnabled: v }));
    addToggle('High Quality FX', this.settings.quality === 'high', (v) =>
      this.update({ quality: v ? 'high' : 'low' }),
    );
    addToggle('Reduce Flashing (Accessibility)', this.settings.reduceFlashing, (v) =>
      this.update({ reduceFlashing: v }),
    );
    addToggle('Parry Assist (+4f wider window)', this.settings.parryAssist, (v) =>
      this.update({ parryAssist: v }),
    );
    addToggle('Colorblind-Safe Telegraph Cues', this.settings.colorblindTelegraph, (v) =>
      this.update({ colorblindTelegraph: v }),
    );
    section('Touch controls');
    const modeLabel = document.createElement('label');
    modeLabel.textContent = 'Show controls';
    const modeSelect = document.createElement('select');
    modeSelect.setAttribute('aria-label', 'Touch controls mode');
    for (const [value, text] of [['auto', 'Automatic (phones & tablets)'], ['on', 'Always on'], ['off', 'Off']]) {
      const option = document.createElement('option');
      option.value = value!;
      option.textContent = text!;
      modeSelect.appendChild(option);
    }
    modeSelect.value = this.settings.touchMode;
    modeSelect.onchange = () => this.update({ touchMode: modeSelect.value as UserSettings['touchMode'] });
    modeLabel.appendChild(modeSelect);
    card.appendChild(modeLabel);
    addToggle('Larger touch buttons', this.settings.touchSize === 'large', value => this.update({ touchSize: value ? 'large' : 'normal' }));
    const opacityLabel = document.createElement('label');
    opacityLabel.textContent = 'Control opacity';
    const opacity = document.createElement('input');
    opacity.type = 'range'; opacity.min = '40'; opacity.max = '100';
    opacity.value = String(this.settings.touchOpacity * 100);
    opacity.oninput = () => this.update({ touchOpacity: Number(opacity.value) / 100 });
    opacityLabel.appendChild(opacity);
    card.appendChild(opacityLabel);
    const hint = document.createElement('p');
    hint.textContent = 'Landscape gives you the clearest arena view. Hold Parry to block; Break performs an unblockable attack. Move and attack with separate thumbs.';
    card.appendChild(hint);

    section('Keyboard controls');
    // P1 Key rebinding
    const keyHeader = document.createElement('div');
    keyHeader.textContent = 'P1 Key Bindings (click to rebind)';
    keyHeader.style.cssText = 'font-size:12px;font-weight:700;color:#d8c9a8;margin-top:6px;';
    card.appendChild(keyHeader);

    const keyGrid = document.createElement('div');
    keyGrid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;';
    const actions: InputAction[] = ['left', 'right', 'up', 'down', 'light', 'heavy', 'block', 'dodge', 'grab', 'special'];
    for (const act of actions) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = `${act.toUpperCase()}: ${this.settings.p1Keys[act]}`;
      btn.style.cssText =
        'padding:6px;background:#2a2722;color:#f4efe6;border:1px solid rgba(255,255,255,0.16);border-radius:4px;font-size:11px;cursor:pointer;';
      btn.onclick = () => {
        this.cancelRebind?.();
        this.root.dataset.rebinding = 'true';
        btn.textContent = `${act.toUpperCase()}: Press key (Esc cancels)`;
        const listener = (e: KeyboardEvent) => {
          e.preventDefault();
          e.stopImmediatePropagation();
          this.cancelRebind?.();
          if (e.code === 'Escape') return;
          btn.textContent = `${act.toUpperCase()}: ${e.code}`;
          this.update({ p1Keys: { ...this.settings.p1Keys, [act]: e.code } });
        };
        this.cancelRebind = () => {
          window.removeEventListener('keydown', listener, true);
          btn.textContent = `${act.toUpperCase()}: ${this.settings.p1Keys[act]}`;
          delete this.root.dataset.rebinding;
          this.cancelRebind = null;
        };
        window.addEventListener('keydown', listener, true);
      };
      keyGrid.appendChild(btn);
    }
    card.appendChild(keyGrid);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.textContent = 'Done · Return to game menu';
    closeBtn.className = 'panel-primary';
    closeBtn.style.cssText =
      'margin-top:8px;padding:10px;background:#f5c84c;color:#141311;border:none;border-radius:6px;font-weight:800;cursor:pointer;';
    closeBtn.onclick = this.onClose;
    card.appendChild(closeBtn);

    this.root.appendChild(card);
  }

  public dispose(): void {
    this.cancelRebind?.();
    this.focusPanel(false);
    this.root.remove();
  }
}
