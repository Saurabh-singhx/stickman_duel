import { panelFocus } from './PanelFocus';
import type { GameState } from '../sim/State';

/**
 * Post-match results overlay showing winner, round scores, combat stats,
 * replay export button, rematch, and return to main menu.
 */
export class ResultsView {
  private readonly root: HTMLDivElement;
  private focusPanel: (visible: boolean) => void = () => {};
  private readonly onRematch: () => void;
  private readonly onCopyReplay: () => void;
  private readonly onMainMenu: () => void;

  constructor(
    uiRoot: HTMLElement,
    callbacks: {
      onRematch: () => void;
      onCopyReplay: () => void;
      onMainMenu: () => void;
    },
  ) {
    this.onRematch = callbacks.onRematch;
    this.onCopyReplay = callbacks.onCopyReplay;
    this.onMainMenu = callbacks.onMainMenu;
    this.root = document.createElement('div');
    this.root.className = 'results-overlay interactive';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(14,13,11,0.78);z-index:36;';
    uiRoot.appendChild(this.root);
    this.focusPanel = panelFocus(this.root);
  }

  /** Displays the results screen populated from the completed GameState. */
  public show(state: GameState, modeTitle: string, hasReplay: boolean): void {
    this.root.textContent = '';
    const card = document.createElement('div');
    card.className = 'game-panel';
    card.style.cssText =
      'width:400px;background:#1c1a17;border:1px solid rgba(245,200,76,0.55);border-radius:10px;padding:24px;display:flex;flex-direction:column;gap:12px;';

    const header = document.createElement('div');
    header.style.cssText = 'text-align:center;';
    const h2 = document.createElement('h2');
    h2.textContent =
      state.winner === 0 ? 'VICTORY' : state.winner === 1 ? 'DEFEAT' : 'DRAW';
    h2.style.cssText = `font-size:34px;letter-spacing:6px;color:${state.winner === 0 ? '#ffd54f' : '#ef6456'};`;
    const sub = document.createElement('div');
    sub.textContent = `${modeTitle} • Rounds ${state.scores[0]} - ${state.scores[1]}`;
    sub.style.cssText = 'font-size:13px;color:#d6cfc2;margin-top:4px;';
    header.append(h2, sub);
    card.appendChild(header);

    const s = state.stats[0];
    const statBox = document.createElement('div');
    statBox.style.cssText =
      'display:grid;grid-template-columns:1fr 1fr;gap:8px;background:rgba(255,255,255,0.04);padding:12px;border-radius:6px;font-size:13px;';
    const rows: Array<[string, number]> = [
      ['Parries', s.parries],
      ['Perfect Dodges', s.perfectDodges],
      ['Guard Breaks', s.guardBreaks],
      ['Finishers', s.finishers],
      ['Max Combo', s.maxCombo],
      ['Damage Dealt', s.damageDealt],
    ];
    for (const [k, v] of rows) {
      const cell = document.createElement('div');
      cell.textContent = `${k}: ${v}`;
      statBox.appendChild(cell);
    }
    card.appendChild(statBox);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const mkBtn = (label: string, primary: boolean, fn: () => void) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = primary ? 'panel-action panel-primary' : 'panel-action';
      b.textContent = label;
      b.style.cssText = primary
        ? 'padding:11px;background:#f5c84c;color:#141311;border:none;border-radius:6px;font-weight:800;cursor:pointer;'
        : 'padding:10px;background:#2b2823;color:#f4efe6;border:1px solid rgba(255,255,255,0.18);border-radius:6px;font-weight:700;cursor:pointer;';
      b.onclick = fn;
      actions.appendChild(b);
    };

    mkBtn('Rematch', true, this.onRematch);
    if (hasReplay) {
      mkBtn('Copy Replay Code', false, this.onCopyReplay);
    }
    mkBtn('Main Menu', false, this.onMainMenu);
    card.appendChild(actions);

    this.root.appendChild(card);
    this.root.style.display = 'flex';
    this.focusPanel(true);
  }

  public hide(): void {
    this.root.style.display = 'none';
    this.focusPanel(false);
  }

  public dispose(): void {
    this.focusPanel(false);
    this.root.remove();
  }
}
