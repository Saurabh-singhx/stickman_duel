import type { SfxController } from '../audio/Sfx';
import { BALANCE } from '../data/balance';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { STAGE_LIST, STAGES, type StageId } from '../data/stages';
import { HudView } from '../render/Hud';
import { Renderer, type RenderOptions } from '../render/Renderer';
import { hashState } from '../sim/Snapshot';
import type { GameState } from '../sim/State';
import type { DebugOverlay } from './DebugOverlay';
import {
  buildLabSequence,
  getLabCatalog,
  type LabCatalog,
  type LabCatalogItem,
  type LabCategory,
  type LabSequence,
} from './LabScenarios';

export interface LabBridgeApi {
  getCatalog(): LabCatalog;
  loadScenario(req: {
    category: LabCategory;
    id: string;
    p1Char?: CharacterId;
    p2Char?: CharacterId;
    stageId?: StageId;
    hitTarget?: boolean;
    p1X?: number;
    p2X?: number;
  }): {
    label: string;
    subtitle: string;
    totalFrames: number;
    p1X: number;
    p2X: number;
    keyFrames: readonly { label: string; frame: number }[];
  };
  seekFrame(frameIndex: number): void;
  setPositions(p1X: number | null, p2X: number | null): void;
  setPlaying(playing: boolean): void;
  setUiHidden(hidden: boolean, hideChip?: boolean): void;
  setHitboxesVisible(visible: boolean): void;
  setQuality(quality: 'low' | 'high'): void;
  getInfo(): {
    category: LabCategory;
    id: string;
    frameIndex: number;
    totalFrames: number;
    p1X: number;
    p2X: number;
    playing: boolean;
    uiHidden: boolean;
  };
}

/**
 * Interactive Animation & Cinematics Lab (?lab=1) for inspecting every player special,
 * cinematic finisher, boss arena special, move, and character animation frame-by-frame.
 */
export class AnimationLab {
  private readonly catalog = getLabCatalog();
  private readonly root: HTMLDivElement;
  private readonly topBar: HTMLDivElement;
  private readonly bottomBar: HTMLDivElement;
  private readonly showChip: HTMLButtonElement;

  private readonly categoryBtns = new Map<LabCategory, HTMLButtonElement>();
  private readonly itemSelect: HTMLSelectElement;
  private readonly p1Select: HTMLSelectElement;
  private readonly p2Select: HTMLSelectElement;
  private readonly stageSelect: HTMLSelectElement;
  private readonly p1XSlider: HTMLInputElement;
  private readonly p2XSlider: HTMLInputElement;
  private readonly p1XReadout: HTMLSpanElement;
  private readonly p2XReadout: HTMLSpanElement;
  private readonly distReadout: HTMLSpanElement;
  private readonly subtitleEl: HTMLDivElement;

  private readonly playBtn: HTMLButtonElement;
  private readonly loopCheck: HTMLInputElement;
  private readonly speedSelect: HTMLSelectElement;
  private readonly scrubber: HTMLInputElement;
  private readonly frameReadout: HTMLSpanElement;
  private readonly stateReadout: HTMLSpanElement;
  private readonly keyframeWrap: HTMLDivElement;
  private readonly hitboxCheck: HTMLInputElement;
  private readonly hitTargetCheck: HTMLInputElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly flashCheck: HTMLInputElement;
  private readonly glowCheck: HTMLInputElement;

  private category: LabCategory = 'player_special';
  private itemId = 'aerial_lasers';
  private p1Char: CharacterId = 'hero';
  private p2Char: CharacterId = 'warden';
  private stageId: StageId = 'beige_plain';
  private hitTarget = true;
  private p1XOverride: number | null = null;
  private p2XOverride: number | null = null;

  private sequence!: LabSequence;
  private frameIndex = 0;
  private playing = true;
  private loop = true;
  private speed = 1;
  private accumulator = 0;
  private uiHidden = false;
  private sfxEnabled = false;
  private lastDispatchedIdx = -1;
  private needsStaticRender = true;

  private labRenderOpts: RenderOptions = {
    screenShake: true,
    glowEnabled: true,
    reduceFlashing: false,
    colorblindTelegraph: false,
    quality: 'high',
  };

  private readonly renderer: Renderer;
  private readonly hud: HudView;
  private readonly debugOverlay: DebugOverlay;
  private readonly sfx: SfxController;

  constructor(
    uiRoot: HTMLElement,
    renderer: Renderer,
    hud: HudView,
    debugOverlay: DebugOverlay,
    sfx: SfxController,
    initialHideUi = false,
  ) {
    this.renderer = renderer;
    this.hud = hud;
    this.debugOverlay = debugOverlay;
    this.sfx = sfx;
    this.uiHidden = initialHideUi;
    this.sfxEnabled = !initialHideUi;

    this.root = document.createElement('div');
    this.root.className = 'lab-root';
    this.root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:40;font-family:Inter,system-ui,sans-serif;color:#f5efe4;';

    // Top control bar
    this.topBar = document.createElement('div');
    this.topBar.className = 'interactive';
    this.topBar.style.cssText =
      'position:absolute;top:10px;left:12px;right:12px;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:10px 12px;background:rgba(18,17,15,0.88);border:1px solid rgba(235,196,91,0.38);border-radius:10px;backdrop-filter:blur(6px);';

    const title = document.createElement('div');
    title.textContent = 'ANIMATION LAB';
    title.style.cssText =
      'font-size:12px;font-weight:900;letter-spacing:1.6px;color:#ebc45b;padding-right:6px;';
    this.topBar.appendChild(title);

    const categories: { id: LabCategory; label: string }[] = [
      { id: 'player_special', label: `Specials (${this.catalog.playerSpecials.length})` },
      { id: 'finisher', label: `Finishers (${this.catalog.finishers.length})` },
      { id: 'boss_special', label: `Boss Attacks (${this.catalog.bossSpecials.length})` },
      { id: 'move', label: `Moves (${this.catalog.moves.length})` },
      { id: 'state', label: `States (${this.catalog.states.length})` },
    ];
    for (const c of categories) {
      const btn = this.makeBtn(c.label);
      btn.dataset.testid = `lab-cat-${c.id}`;
      btn.onclick = () => this.selectCategory(c.id);
      this.categoryBtns.set(c.id, btn);
      this.topBar.appendChild(btn);
    }

    const prevBtn = this.makeBtn('◀');
    prevBtn.title = 'Previous item ([)';
    prevBtn.onclick = () => this.stepItem(-1);
    this.itemSelect = this.makeSelect('Lab Item');
    this.itemSelect.style.minWidth = '210px';
    this.itemSelect.onchange = () => {
      this.itemId = this.itemSelect.value;
      this.reloadSequence();
    };
    const nextBtn = this.makeBtn('▶');
    nextBtn.title = 'Next item (])';
    nextBtn.onclick = () => this.stepItem(1);

    this.p1Select = this.makeSelect('P1 Character');
    this.p2Select = this.makeSelect('P2 Character');
    for (const ch of this.catalog.characters) {
      const o1 = new Option(`P1: ${ch.name}`, ch.id);
      const o2 = new Option(`P2: ${ch.name}`, ch.id);
      this.p1Select.appendChild(o1);
      this.p2Select.appendChild(o2);
    }
    this.p1Select.value = this.p1Char;
    this.p2Select.value = this.p2Char;
    this.p1Select.onchange = () => {
      this.p1Char = this.p1Select.value as CharacterId;
      this.reloadSequence();
    };
    this.p2Select.onchange = () => {
      this.p2Char = this.p2Select.value as CharacterId;
      this.reloadSequence();
    };

    this.stageSelect = this.makeSelect('Stage');
    for (const stId of STAGE_LIST) {
      this.stageSelect.appendChild(new Option(`Stage: ${STAGES[stId].name}`, stId));
    }
    this.stageSelect.value = this.stageId;
    this.stageSelect.onchange = () => {
      this.stageId = this.stageSelect.value as StageId;
      this.reloadSequence();
    };

    const exitBtn = this.makeBtn('Exit Lab');
    exitBtn.onclick = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete('lab');
      url.searchParams.delete('hideUi');
      window.location.href = url.toString();
    };

    this.subtitleEl = document.createElement('div');
    this.subtitleEl.style.cssText = 'font-size:11.5px;color:#d6ccb8;letter-spacing:0.3px;';

    // Character X-position / spacing row
    const posRow = document.createElement('div');
    posRow.style.cssText =
      'width:100%;display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-top:4px;border-top:1px solid rgba(255,255,255,0.08);';

    const minPx = BALANCE.STAGE_LEFT_PX + 20;
    const maxPx = BALANCE.STAGE_RIGHT_PX - 20;

    const makePosSlider = (labelText: string, color: string) => {
      const wrap = document.createElement('label');
      wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:#e5dccb;';
      const lbl = document.createElement('span');
      lbl.textContent = labelText;
      lbl.style.color = color;
      lbl.style.fontWeight = '700';
      const slider = document.createElement('input');
      slider.type = 'range';
      slider.min = String(minPx);
      slider.max = String(maxPx);
      slider.step = '10';
      slider.style.cssText = 'width:130px;accent-color:#ebc45b;cursor:pointer;';
      const readout = document.createElement('span');
      readout.style.cssText = 'font-family:monospace;font-size:11.5px;color:#ffd54f;min-width:46px;';
      wrap.append(lbl, slider, readout);
      return { wrap, slider, readout };
    };

    const p1Pos = makePosSlider('P1 X', '#fde047');
    const p2Pos = makePosSlider('P2 X', '#93c5fd');
    this.p1XSlider = p1Pos.slider;
    this.p2XSlider = p2Pos.slider;
    this.p1XReadout = p1Pos.readout;
    this.p2XReadout = p2Pos.readout;

    this.p1XSlider.oninput = () => {
      this.p1XOverride = Number(this.p1XSlider.value);
      if (this.p2XOverride === null) this.p2XOverride = this.sequence.p2X;
      this.reloadSequence(true);
    };
    this.p2XSlider.oninput = () => {
      this.p2XOverride = Number(this.p2XSlider.value);
      if (this.p1XOverride === null) this.p1XOverride = this.sequence.p1X;
      this.reloadSequence(true);
    };

    this.distReadout = document.createElement('span');
    this.distReadout.style.cssText = 'font-family:monospace;font-size:11.5px;color:#b8d4c8;min-width:74px;';

    const makePreset = (label: string, fn: () => void) => {
      const b = this.makeBtn(label);
      b.style.padding = '3px 8px';
      b.style.minHeight = '24px';
      b.style.fontSize = '11px';
      b.onclick = fn;
      return b;
    };

    const closeBtn = makePreset('Close', () => this.setPositions(585, 685));
    const midBtn = makePreset('Normal', () => this.setPositions(480, 780));
    const farBtn = makePreset('Far', () => this.setPositions(190, 1090));
    const swapBtn = makePreset('Swap', () => {
      const curr1 = this.p1XOverride ?? this.sequence.p1X;
      const curr2 = this.p2XOverride ?? this.sequence.p2X;
      this.setPositions(curr2, curr1);
    });
    const autoBtn = makePreset('Auto', () => this.setPositions(null, null));

    posRow.append(
      p1Pos.wrap,
      p2Pos.wrap,
      this.distReadout,
      closeBtn,
      midBtn,
      farBtn,
      swapBtn,
      autoBtn,
      this.subtitleEl,
    );

    this.topBar.append(
      prevBtn,
      this.itemSelect,
      nextBtn,
      this.p1Select,
      this.p2Select,
      this.stageSelect,
      exitBtn,
      posRow,
    );

    // Bottom playback + scrubber bar
    this.bottomBar = document.createElement('div');
    this.bottomBar.className = 'interactive';
    this.bottomBar.style.cssText =
      'position:absolute;bottom:10px;left:12px;right:12px;display:flex;flex-direction:column;gap:8px;padding:10px 12px;background:rgba(18,17,15,0.88);border:1px solid rgba(235,196,91,0.38);border-radius:10px;backdrop-filter:blur(6px);';

    const row1 = document.createElement('div');
    row1.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:8px;';

    this.playBtn = this.makeBtn('Pause');
    this.playBtn.style.minWidth = '72px';
    this.playBtn.onclick = () => this.setPlaying(!this.playing);

    const back1Btn = this.makeBtn('-1f');
    back1Btn.onclick = () => {
      this.setPlaying(false);
      this.seekFrame(this.frameIndex - 1);
    };
    const fwd1Btn = this.makeBtn('+1f');
    fwd1Btn.onclick = () => {
      this.setPlaying(false);
      this.seekFrame(this.frameIndex + 1);
    };
    const replayBtn = this.makeBtn('Restart');
    replayBtn.onclick = () => {
      this.seekFrame(0);
      if (this.sfxEnabled && this.sequence.frames[0]?.events.length) {
        this.sfx.handleEvents(this.sequence.frames[0]!.events);
      }
      this.setPlaying(true);
    };

    this.speedSelect = this.makeSelect('Playback Speed');
    for (const s of [
      { v: '0.25', t: '0.25x' },
      { v: '0.5', t: '0.5x' },
      { v: '1', t: '1x' },
    ]) {
      this.speedSelect.appendChild(new Option(s.t, s.v));
    }
    this.speedSelect.value = '1';
    this.speedSelect.onchange = () => {
      this.speed = Number(this.speedSelect.value) || 1;
    };

    const loopWrap = this.makeCheck('Loop', true);
    this.loopCheck = loopWrap.input;
    this.loopCheck.onchange = () => {
      this.loop = this.loopCheck.checked;
    };

    this.scrubber = document.createElement('input');
    this.scrubber.type = 'range';
    this.scrubber.min = '0';
    this.scrubber.max = '100';
    this.scrubber.value = '0';
    this.scrubber.style.cssText = 'flex:1;min-width:160px;accent-color:#ebc45b;cursor:pointer;';
    this.scrubber.oninput = () => {
      this.setPlaying(false);
      this.seekFrame(Number(this.scrubber.value));
    };

    this.frameReadout = document.createElement('span');
    this.frameReadout.style.cssText = 'font-family:monospace;font-size:12px;color:#ffd54f;min-width:96px;text-align:right;';

    row1.append(
      this.playBtn,
      back1Btn,
      fwd1Btn,
      replayBtn,
      this.speedSelect,
      loopWrap.label,
      this.scrubber,
      this.frameReadout,
    );

    const row2 = document.createElement('div');
    row2.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:8px;';

    this.keyframeWrap = document.createElement('div');
    this.keyframeWrap.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:6px;';

    const toggles = document.createElement('div');
    toggles.style.cssText = 'display:flex;flex-wrap:wrap;align-items:center;gap:10px;';

    const hitboxWrap = this.makeCheck('Hitboxes (F1)', false);
    this.hitboxCheck = hitboxWrap.input;
    this.hitboxCheck.onchange = () => this.setHitboxesVisible(this.hitboxCheck.checked);

    const hitTargetWrap = this.makeCheck('Connect Hit', true);
    this.hitTargetCheck = hitTargetWrap.input;
    this.hitTargetCheck.onchange = () => {
      this.hitTarget = this.hitTargetCheck.checked;
      this.reloadSequence();
    };

    this.qualitySelect = this.makeSelect('Quality');
    this.qualitySelect.append(new Option('High FX', 'high'), new Option('Low FX', 'low'));
    this.qualitySelect.onchange = () => {
      this.labRenderOpts = { ...this.labRenderOpts, quality: this.qualitySelect.value as 'low' | 'high' };
      this.seekFrame(this.frameIndex);
    };

    const flashWrap = this.makeCheck('Reduce Flash', false);
    this.flashCheck = flashWrap.input;
    this.flashCheck.onchange = () => {
      this.labRenderOpts = { ...this.labRenderOpts, reduceFlashing: this.flashCheck.checked };
      this.seekFrame(this.frameIndex);
    };

    const glowWrap = this.makeCheck('Glow', true);
    this.glowCheck = glowWrap.input;
    this.glowCheck.onchange = () => {
      this.labRenderOpts = { ...this.labRenderOpts, glowEnabled: this.glowCheck.checked };
      this.seekFrame(this.frameIndex);
    };

    const sfxWrap = this.makeCheck('SFX', this.sfxEnabled);
    sfxWrap.input.onchange = () => {
      this.sfxEnabled = sfxWrap.input.checked;
    };

    const hideBtn = this.makeBtn('Hide UI (H)');
    hideBtn.onclick = () => this.setUiHidden(true);

    toggles.append(
      hitboxWrap.label,
      hitTargetWrap.label,
      this.qualitySelect,
      flashWrap.label,
      glowWrap.label,
      sfxWrap.label,
      hideBtn,
    );

    this.stateReadout = document.createElement('div');
    this.stateReadout.style.cssText = 'font-family:monospace;font-size:11.5px;color:#b8d4c8;';

    row2.append(this.keyframeWrap, toggles);
    this.bottomBar.append(row1, row2, this.stateReadout);

    this.showChip = this.makeBtn('Show Lab (H)');
    this.showChip.className = 'interactive';
    this.showChip.style.cssText += 'position:absolute;top:10px;right:12px;display:none;z-index:45;';
    this.showChip.onclick = () => this.setUiHidden(false);

    this.root.append(this.topBar, this.bottomBar, this.showChip);
    uiRoot.appendChild(this.root);

    window.addEventListener('keydown', this.onKeyDown);

    this.syncCategoryButtons();
    this.populateItemSelect();
    this.reloadSequence();
    this.setUiHidden(this.uiHidden, initialHideUi);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
      if (e.code !== 'KeyH' && e.code !== 'F1') return;
    }
    if (e.code === 'Space') {
      e.preventDefault();
      this.setPlaying(!this.playing);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      this.setPlaying(false);
      this.seekFrame(this.frameIndex - 1);
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      this.setPlaying(false);
      this.seekFrame(this.frameIndex + 1);
    } else if (e.code === 'BracketLeft') {
      e.preventDefault();
      this.stepItem(-1);
    } else if (e.code === 'BracketRight') {
      e.preventDefault();
      this.stepItem(1);
    } else if (e.code === 'KeyH') {
      e.preventDefault();
      this.setUiHidden(!this.uiHidden);
    } else if (e.code === 'F1') {
      this.hitboxCheck.checked = !this.hitboxCheck.checked;
      this.setHitboxesVisible(this.hitboxCheck.checked);
    }
  };

  private makeBtn(text: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = text;
    b.style.cssText =
      'padding:5px 10px;min-height:30px;background:#26231d;color:#f4efe6;border:1px solid #5c5342;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
    return b;
  }

  private makeSelect(ariaLabel: string): HTMLSelectElement {
    const s = document.createElement('select');
    s.setAttribute('aria-label', ariaLabel);
    s.style.cssText =
      'padding:5px 8px;min-height:30px;background:#26231d;color:#f4efe6;border:1px solid #5c5342;border-radius:6px;font-size:12px;';
    return s;
  }

  private makeCheck(labelText: string, checked: boolean): { label: HTMLLabelElement; input: HTMLInputElement } {
    const label = document.createElement('label');
    label.style.cssText = 'display:inline-flex;align-items:center;gap:5px;font-size:12px;cursor:pointer;color:#e5dccb;';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.style.accentColor = '#ebc45b';
    label.append(input, document.createTextNode(labelText));
    return { label, input };
  }

  private getItemsForCategory(cat: LabCategory): readonly LabCatalogItem[] {
    switch (cat) {
      case 'player_special':
        return this.catalog.playerSpecials;
      case 'finisher':
        return this.catalog.finishers;
      case 'boss_special':
        return this.catalog.bossSpecials;
      case 'move':
        return this.catalog.moves;
      case 'state':
        return this.catalog.states;
    }
  }

  private selectCategory(cat: LabCategory): void {
    this.category = cat;
    const list = this.getItemsForCategory(cat);
    this.itemId = list[0]?.id ?? '';
    this.syncCategoryButtons();
    this.populateItemSelect();
    this.reloadSequence();
  }

  private syncCategoryButtons(): void {
    for (const [cat, btn] of this.categoryBtns.entries()) {
      const active = cat === this.category;
      btn.style.background = active ? '#ebc45b' : '#26231d';
      btn.style.color = active ? '#1c170b' : '#f4efe6';
      btn.style.borderColor = active ? '#ffe599' : '#5c5342';
    }
  }

  private populateItemSelect(): void {
    const list = this.getItemsForCategory(this.category);
    this.itemSelect.textContent = '';
    for (const item of list) {
      this.itemSelect.appendChild(new Option(`${item.label} — ${item.detail}`, item.id));
    }
    this.itemSelect.value = this.itemId;
  }

  private stepItem(delta: number): void {
    const list = this.getItemsForCategory(this.category);
    if (list.length === 0) return;
    const idx = Math.max(0, list.findIndex((i) => i.id === this.itemId));
    const next = list[(idx + delta + list.length) % list.length]!;
    this.itemId = next.id;
    this.itemSelect.value = this.itemId;
    this.reloadSequence();
  }

  public setPositions(p1X: number | null, p2X: number | null): void {
    this.p1XOverride = p1X;
    this.p2XOverride = p2X;
    this.reloadSequence(true);
  }

  private reloadSequence(preserveFrame = false): void {
    const prevFrame = this.frameIndex;
    this.sequence = buildLabSequence({
      category: this.category,
      id: this.itemId,
      p1Char: this.p1Char,
      p2Char: this.p2Char,
      stageId: this.stageId,
      hitTarget: this.hitTarget,
      ...(this.p1XOverride !== null ? { p1X: this.p1XOverride } : {}),
      ...(this.p2XOverride !== null ? { p2X: this.p2XOverride } : {}),
    });
    // Sync P2 selector if boss special chose its owner character
    if (this.sequence.p2Char !== this.p2Char) {
      this.p2Char = this.sequence.p2Char;
      this.p2Select.value = this.p2Char;
    }
    this.p1XSlider.value = String(this.sequence.p1X);
    this.p2XSlider.value = String(this.sequence.p2X);
    this.p1XReadout.textContent = `${this.sequence.p1X}px`;
    this.p2XReadout.textContent = `${this.sequence.p2X}px`;
    this.distReadout.textContent = `dist=${Math.abs(this.sequence.p2X - this.sequence.p1X)}px`;
    this.subtitleEl.textContent = this.sequence.subtitle;
    this.scrubber.max = String(Math.max(0, this.sequence.frames.length - 1));
    this.renderKeyframes();
    const nextIdx = preserveFrame ? Math.min(prevFrame, Math.max(0, this.sequence.frames.length - 1)) : 0;
    this.seekFrame(nextIdx);
  }

  private renderKeyframes(): void {
    this.keyframeWrap.textContent = '';
    for (const kf of this.sequence.keyFrames) {
      const btn = this.makeBtn(`${kf.label} (f${kf.frame})`);
      btn.style.padding = '3px 8px';
      btn.style.minHeight = '24px';
      btn.style.fontSize = '11px';
      btn.onclick = () => {
        this.setPlaying(false);
        this.seekFrame(kf.frame);
      };
      this.keyframeWrap.appendChild(btn);
    }
  }

  public setPlaying(playing: boolean): void {
    this.playing = playing;
    this.playBtn.textContent = playing ? 'Pause' : 'Play';
  }

  public setUiHidden(hidden: boolean, hideToggleChip = false): void {
    this.uiHidden = hidden;
    this.topBar.style.display = hidden ? 'none' : 'flex';
    this.bottomBar.style.display = hidden ? 'none' : 'flex';
    this.showChip.style.display = hidden && !hideToggleChip ? 'inline-flex' : 'none';
    this.hud.setVisible(!hidden);
  }

  public setHitboxesVisible(visible: boolean): void {
    this.hitboxCheck.checked = visible;
    this.debugOverlay.setVisible(visible);
    this.seekFrame(this.frameIndex);
  }

  /**
   * Jumps to any frame index while warming up pooled VFX, pose blending,
   * cape physics, and camera zoom over the preceding ~24 frames.
   */
  public seekFrame(rawIndex: number): void {
    const maxIdx = Math.max(0, this.sequence.frames.length - 1);
    const target = Math.max(0, Math.min(maxIdx, Math.round(rawIndex)));
    this.frameIndex = target;
    this.accumulator = 0;

    const first = this.sequence.frames[0]!;
    this.renderer.mountScene(first.config.p1Char, first.config.p2Char);

    const warmupStart = Math.max(0, target - 24);
    for (let i = warmupStart; i <= target; i += 1) {
      const prev = this.sequence.frames[Math.max(0, i - 1)]!;
      const curr = this.sequence.frames[i]!;
      if (curr.events.length > 0) {
        this.renderer.handleEvents(curr.events, curr, this.labRenderOpts);
      }
      this.renderer.render(prev, curr, 1, this.labRenderOpts);
    }
    const curr = this.sequence.frames[target]!;
    if (!this.uiHidden) {
      this.hud.update(curr, CHARACTERS[curr.config.p2Char].name);
    }
    this.debugOverlay.update(
      curr,
      this.renderer.getDebugGraphics(),
      0,
      this.renderer.getDrawLayerCount(),
      !this.playing,
    );
    this.lastDispatchedIdx = target;
    this.needsStaticRender = false;
    this.syncReadouts();
  }

  /** Advances playback and renders the current Lab frame inside the main RAF loop. */
  public tick(dtMs: number): void {
    if (!this.sequence || this.sequence.frames.length === 0) return;

    const stepMs = 1000 / (60 * this.speed);
    if (this.playing) {
      this.accumulator += dtMs;
      while (this.accumulator >= stepMs) {
        this.accumulator -= stepMs;
        if (this.frameIndex + 1 < this.sequence.frames.length) {
          this.frameIndex += 1;
          const st = this.sequence.frames[this.frameIndex]!;
          if (this.frameIndex !== this.lastDispatchedIdx && st.events.length > 0) {
            this.lastDispatchedIdx = this.frameIndex;
            this.renderer.handleEvents(st.events, st, this.labRenderOpts);
            if (this.sfxEnabled) this.sfx.handleEvents(st.events);
          }
        } else if (this.loop) {
          this.seekFrame(0);
          break;
        } else {
          this.setPlaying(false);
          break;
        }
      }
    }

    if (this.playing || this.needsStaticRender) {
      this.needsStaticRender = false;
      const prev = this.sequence.frames[Math.max(0, this.frameIndex - 1)]!;
      const curr = this.sequence.frames[this.frameIndex]!;
      const alpha = this.playing ? Math.min(1, this.accumulator / stepMs) : 1;
      if (!this.playing) {
        // Re-seek cleanly when static toggle (like hitboxes) triggered re-render
        this.renderer.render(prev, curr, 1, this.labRenderOpts);
      } else {
        this.renderer.render(prev, curr, alpha, this.labRenderOpts);
      }
      if (!this.uiHidden) {
        this.hud.update(curr, CHARACTERS[curr.config.p2Char].name);
      }
      this.debugOverlay.update(
        curr,
        this.renderer.getDebugGraphics(),
        0,
        this.renderer.getDrawLayerCount(),
        !this.playing,
      );
      this.syncReadouts();
    }
  }

  private syncReadouts(): void {
    const curr = this.sequence.frames[this.frameIndex];
    if (!curr) return;
    const maxIdx = Math.max(0, this.sequence.frames.length - 1);
    this.scrubber.value = String(this.frameIndex);
    this.frameReadout.textContent = `f${this.frameIndex} / ${maxIdx}`;
    const [f0, f1] = curr.fighters;
    const specInfo = curr.activeSpecial
      ? ` · sp:${curr.activeSpecial.specialId}[${curr.activeSpecial.frame}]`
      : curr.activeFinisherId
        ? ` · fin:${curr.activeFinisherId}[${curr.phaseFrame}]`
        : curr.bossSpecials[0]
          ? ` · boss:${curr.bossSpecials[0].specialId}(${curr.bossSpecials[0].phase}[${curr.bossSpecials[0].frame}])`
          : '';
    this.stateReadout.textContent =
      `phase=${curr.phase} | P1=${f0.action}[${f0.actionFrame}] | P2=${f1.action}[${f1.actionFrame}] | hash=0x${hashState(curr).toString(16).padStart(8, '0')}${specInfo}`;
  }

  public getCurrentState(): GameState {
    return this.sequence.frames[this.frameIndex]!;
  }

  public getBridgeApi(): LabBridgeApi {
    return {
      getCatalog: () => this.catalog,
      loadScenario: (req) => {
        this.category = req.category;
        this.itemId = req.id;
        if (req.p1Char) {
          this.p1Char = req.p1Char;
          this.p1Select.value = req.p1Char;
        }
        if (req.p2Char) {
          this.p2Char = req.p2Char;
          this.p2Select.value = req.p2Char;
        }
        if (req.stageId) {
          this.stageId = req.stageId;
          this.stageSelect.value = req.stageId;
        }
        if (req.hitTarget !== undefined) {
          this.hitTarget = req.hitTarget;
          this.hitTargetCheck.checked = req.hitTarget;
        }
        this.p1XOverride = req.p1X ?? null;
        this.p2XOverride = req.p2X ?? null;
        this.syncCategoryButtons();
        this.populateItemSelect();
        this.setPlaying(false);
        this.reloadSequence();
        return {
          label: this.sequence.label,
          subtitle: this.sequence.subtitle,
          totalFrames: this.sequence.frames.length,
          p1X: this.sequence.p1X,
          p2X: this.sequence.p2X,
          keyFrames: this.sequence.keyFrames,
        };
      },
      seekFrame: (idx) => {
        this.setPlaying(false);
        this.seekFrame(idx);
      },
      setPositions: (p1X, p2X) => this.setPositions(p1X, p2X),
      setPlaying: (p) => this.setPlaying(p),
      setUiHidden: (h, hideChip = true) => this.setUiHidden(h, hideChip),
      setHitboxesVisible: (v) => this.setHitboxesVisible(v),
      setQuality: (q) => {
        this.qualitySelect.value = q;
        this.labRenderOpts = { ...this.labRenderOpts, quality: q };
        this.seekFrame(this.frameIndex);
      },
      getInfo: () => ({
        category: this.category,
        id: this.itemId,
        frameIndex: this.frameIndex,
        totalFrames: this.sequence.frames.length,
        p1X: this.sequence.p1X,
        p2X: this.sequence.p2X,
        playing: this.playing,
        uiHidden: this.uiHidden,
      }),
    };
  }

  public dispose(): void {
    window.removeEventListener('keydown', this.onKeyDown);
    this.root.remove();
  }
}
