import { CHARACTERS } from '../data/characters';
import type { GameState } from '../sim/State';

/**
 * Minimalist HUD overlay rendered cleanly in DOM over the PixiJS canvas:
 * HP bars, guard meters, round pips, timer, combo counters, and callout banners.
 */
export class HudView {
  private readonly root: HTMLDivElement;
  private readonly p1NameEl: HTMLDivElement;
  private readonly p2NameEl: HTMLDivElement;
  private readonly p1HpFill: HTMLDivElement;
  private readonly p2HpFill: HTMLDivElement;
  private readonly p1GuardFill: HTMLDivElement;
  private readonly p2GuardFill: HTMLDivElement;
  private readonly p1SpecialFill: HTMLDivElement;
  private readonly p2SpecialFill: HTMLDivElement;
  private readonly p1Pips: HTMLDivElement;
  private readonly p2Pips: HTMLDivElement;
  private readonly timerEl: HTMLDivElement;
  private readonly bannerEl: HTMLDivElement;
  private readonly p1ComboEl: HTMLDivElement;
  private readonly p2ComboEl: HTMLDivElement;
  private readonly netBadgeEl: HTMLDivElement;
  private bannerTimer = 0;

  constructor(uiRoot: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'hud-overlay';
    this.root.style.cssText =
      'position:absolute;inset:0;pointer-events:none;display:none;flex-direction:column;justify-content:space-between;padding:18px 28px;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:grid;grid-template-columns:1fr 96px 1fr;gap:18px;align-items:start;';

    // P1 panel
    const p1Box = document.createElement('div');
    this.p1NameEl = document.createElement('div');
    this.p1NameEl.style.cssText = 'display:flex;justify-content:space-between;font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:5px;text-shadow:0 1px 4px rgba(0,0,0,0.65);';
    this.p1Pips = document.createElement('div');
    this.p1Pips.style.cssText = 'display:flex;gap:6px;align-items:center;';
    const p1HpBar = this.makeBar('#1d1b18', 14);
    this.p1HpFill = this.makeFill('#f5f2e9');
    p1HpBar.appendChild(this.p1HpFill);
    const p1GuardBar = this.makeBar('#1d1b18', 6);
    p1GuardBar.style.marginTop = '4px';
    this.p1GuardFill = this.makeFill('#f5c84c');
    p1GuardBar.appendChild(this.p1GuardFill);
    this.p1ComboEl = document.createElement('div');
    this.p1ComboEl.style.cssText = 'margin-top:8px;font-size:18px;font-weight:800;color:#ffd54f;letter-spacing:1px;text-shadow:0 2px 6px rgba(0,0,0,0.7);min-height:22px;';
    const p1SpecBar = this.makeBar('#161b22', 6);
    p1SpecBar.style.marginTop = '4px';
    this.p1SpecialFill = this.makeFill('#38bdf8');
    p1SpecBar.appendChild(this.p1SpecialFill);
    p1Box.append(this.p1NameEl, p1HpBar, p1GuardBar, p1SpecBar, this.p1ComboEl);

    // Center timer
    const centerBox = document.createElement('div');
    centerBox.style.cssText = 'display:flex;flex-direction:column;align-items:center;';
    this.timerEl = document.createElement('div');
    this.timerEl.style.cssText =
      'font-size:30px;font-weight:800;letter-spacing:1px;padding:4px 14px;background:rgba(20,19,17,0.72);border:1px solid rgba(255,213,90,0.45);border-radius:8px;color:#f8f4ea;';
    this.netBadgeEl = document.createElement('div');
    this.netBadgeEl.style.cssText =
      'margin-top:6px;font-size:11px;font-weight:600;color:#d6cfc2;background:rgba(20,19,17,0.65);padding:2px 8px;border-radius:4px;display:none;';
    centerBox.append(this.timerEl, this.netBadgeEl);

    // P2 panel
    const p2Box = document.createElement('div');
    this.p2NameEl = document.createElement('div');
    this.p2NameEl.style.cssText = 'display:flex;justify-content:space-between;flex-direction:row-reverse;font-size:13px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;margin-bottom:5px;text-shadow:0 1px 4px rgba(0,0,0,0.65);';
    this.p2Pips = document.createElement('div');
    this.p2Pips.style.cssText = 'display:flex;gap:6px;align-items:center;';
    const p2HpBar = this.makeBar('#1d1b18', 14);
    this.p2HpFill = this.makeFill('#d9483b');
    this.p2HpFill.style.marginLeft = 'auto';
    p2HpBar.appendChild(this.p2HpFill);
    const p2GuardBar = this.makeBar('#1d1b18', 6);
    p2GuardBar.style.marginTop = '4px';
    this.p2GuardFill = this.makeFill('#f5c84c');
    this.p2GuardFill.style.marginLeft = 'auto';
    p2GuardBar.appendChild(this.p2GuardFill);
    this.p2ComboEl = document.createElement('div');
    this.p2ComboEl.style.cssText = 'margin-top:8px;font-size:18px;font-weight:800;color:#ff8a65;letter-spacing:1px;text-align:right;text-shadow:0 2px 6px rgba(0,0,0,0.7);min-height:22px;';
    const p2SpecBar = this.makeBar('#161b22', 6);
    p2SpecBar.style.marginTop = '4px';
    this.p2SpecialFill = this.makeFill('#38bdf8');
    this.p2SpecialFill.style.marginLeft = 'auto';
    p2SpecBar.appendChild(this.p2SpecialFill);
    p2Box.append(this.p2NameEl, p2HpBar, p2GuardBar, p2SpecBar, this.p2ComboEl);

    topRow.append(p1Box, centerBox, p2Box);

    this.bannerEl = document.createElement('div');
    this.bannerEl.style.cssText =
      'position:absolute;top:128px;left:50%;transform:translateX(-50%);font-size:38px;font-weight:900;letter-spacing:6px;text-transform:uppercase;color:#fff8e6;text-shadow:0 4px 20px rgba(0,0,0,0.72);opacity:0;transition:opacity 0.16s ease;white-space:nowrap;';

    this.root.append(topRow, this.bannerEl);
    uiRoot.appendChild(this.root);
  }

  private makeBar(bg: string, height: number): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `width:100%;height:${height}px;background:${bg};border:1px solid rgba(255,255,255,0.22);border-radius:3px;overflow:hidden;`;
    return el;
  }

  private makeFill(color: string): HTMLDivElement {
    const el = document.createElement('div');
    el.style.cssText = `width:100%;height:100%;background:${color};transition:width 0.06s linear;`;
    return el;
  }

  /** Shows or hides the HUD. */
  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
  }

  /** Adjusts top HUD spacing when mobile touch utility buttons occupy top corners. */
  public setTouchMode(active: boolean): void {
    this.root.classList.toggle('with-touch', active);
  }

  /** Displays a temporary center callout banner (e.g. PARRY, GUARD BREAK, ROUND 1). */
  public showBanner(text: string, frames = 55, color = '#fff8e6'): void {
    this.bannerEl.textContent = text;
    this.bannerEl.style.color = color;
    this.bannerEl.style.opacity = '1';
    this.bannerTimer = frames;
  }

  /** Shows or hides the online latency/delay badge. */
  public setNetInfo(text: string | null): void {
    if (text === null) {
      this.netBadgeEl.style.display = 'none';
    } else {
      this.netBadgeEl.style.display = 'block';
      this.netBadgeEl.textContent = text;
    }
  }

  /** Synchronizes HUD elements with the latest simulation state. */
  public update(state: GameState, p2LabelOverride?: string): void {
    const [f0, f1] = state.fighters;
    const c0 = CHARACTERS[f0.charId];
    const c1 = CHARACTERS[f1.charId];

    this.p1NameEl.textContent = '';
    const n1 = document.createElement('span');
    n1.textContent = c0.name;
    this.renderPips(this.p1Pips, state.scores[0], state.config.roundsToWin);
    this.p1NameEl.append(n1, this.p1Pips);

    this.p2NameEl.textContent = '';
    const n2 = document.createElement('span');
    n2.textContent = p2LabelOverride ?? c1.name;
    this.renderPips(this.p2Pips, state.scores[1], state.config.roundsToWin);
    this.p2NameEl.append(n2, this.p2Pips);

    this.p1HpFill.style.width = `${Math.max(0, (f0.hp / f0.maxHp) * 100)}%`;
    this.p2HpFill.style.width = `${Math.max(0, (f1.hp / f1.maxHp) * 100)}%`;
    this.p1GuardFill.style.width = `${Math.max(0, (f0.guard / f0.maxGuard) * 100)}%`;
    this.p2GuardFill.style.width = `${Math.max(0, (f1.guard / f1.maxGuard) * 100)}%`;
    this.p1SpecialFill.style.width = `${Math.max(0, f0.specialMeter)}%`;
    this.p1SpecialFill.style.background = f0.specialMeter >= 100 ? '#ffd54f' : '#38bdf8';
    this.p2SpecialFill.style.width = `${Math.max(0, f1.specialMeter)}%`;
    this.p2SpecialFill.style.background = f1.specialMeter >= 100 ? '#ffd54f' : '#38bdf8';

    if (state.config.trainingMode || state.config.roundTimerFrames <= 0) {
      this.timerEl.textContent = '∞';
    } else {
      const secs = Math.ceil(state.roundTimer / 60);
      this.timerEl.textContent = String(secs).padStart(2, '0');
    }

    this.p1ComboEl.textContent =
      f0.specialMeter >= 100
        ? (navigator.maxTouchPoints > 0 ? 'SPECIAL READY' : 'SPECIAL READY [E]!')
        : f0.counterWindow > 0
        ? 'COUNTER READY!'
        : f0.comboCount >= 2
          ? `${f0.comboCount} HIT COMBO`
          : '';
    this.p2ComboEl.textContent =
      f1.counterWindow > 0
        ? 'COUNTER READY!'
        : f1.comboCount >= 2
          ? `${f1.comboCount} HIT COMBO`
          : '';

    if (this.bannerTimer > 0) {
      this.bannerTimer -= 1;
      if (this.bannerTimer === 0) {
        this.bannerEl.style.opacity = '0';
      }
    }
  }

  private renderPips(container: HTMLDivElement, score: number, max: number): void {
    container.textContent = '';
    for (let i = 0; i < max; i += 1) {
      const pip = document.createElement('span');
      pip.style.cssText = `display:inline-block;width:10px;height:10px;border-radius:50%;border:1px solid #ffd54f;background:${i < score ? '#ffd54f' : 'transparent'};`;
      container.appendChild(pip);
    }
  }

  /** Disposes HUD DOM nodes cleanly. */
  public dispose(): void {
    this.root.remove();
  }
}
