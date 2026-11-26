import { panelFocus } from './PanelFocus';
/**
 * Pause overlay (ESC) with Resume, Settings, Fullscreen, Restart, and Main Menu.
 */
export class PauseView {
  private readonly root: HTMLDivElement;
  private focusPanel: (visible: boolean) => void = () => {};

  constructor(
    uiRoot: HTMLElement,
    callbacks: {
      onResume: () => void;
      onRestart: () => void;
      onSettings: () => void;
      onFullscreen: () => void;
      onMainMenu: () => void;
    },
  ) {
    this.root = document.createElement('div');
    this.root.className = 'pause-overlay interactive';
    this.root.style.cssText =
      'position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(14,13,11,0.74);z-index:35;';

    const card = document.createElement('div');
    card.className = 'game-panel';
    card.style.cssText =
      'width:300px;background:#1c1a17;border:1px solid rgba(245,200,76,0.45);border-radius:10px;padding:22px;display:flex;flex-direction:column;gap:10px;';

    const title = document.createElement('h2');
    title.textContent = 'PAUSED';
    title.style.cssText = 'text-align:center;letter-spacing:5px;margin-bottom:6px;color:#fbf8f0;';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-label', 'Fight paused');
    card.appendChild(title);
    const note = document.createElement('p');
    note.textContent = 'Take a breath. Your next move is waiting.';
    card.appendChild(note);

    const items: Array<[string, () => void]> = [
      ['Resume', callbacks.onResume],
      ['Restart Match', callbacks.onRestart],
      ['Settings', callbacks.onSettings],
      ['Toggle Fullscreen', callbacks.onFullscreen],
      ['Main Menu', callbacks.onMainMenu],
    ];

    for (const [label, fn] of items) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const descriptions: Record<string, string> = {
        Resume: 'Return to the fight', 'Restart Match': 'Start this encounter again',
        Settings: 'Audio, visuals and controls', 'Toggle Fullscreen': 'Switch your display mode',
        'Main Menu': 'Leave this fight and choose a mode',
      };
      const title = document.createElement('strong');
      title.textContent = label;
      const hint = document.createElement('span');
      hint.textContent = descriptions[label] ?? '';
      btn.append(title, hint);
      btn.className = label === 'Resume' ? 'panel-action panel-primary' : 'panel-action';
      btn.style.cssText =
        'padding:10px;background:rgba(42,39,34,0.95);color:#f4efe6;border:1px solid rgba(255,255,255,0.18);border-radius:6px;font-weight:700;cursor:pointer;';
      btn.onclick = fn;
      card.appendChild(btn);
    }

    this.root.appendChild(card);
    uiRoot.appendChild(this.root);
    this.focusPanel = panelFocus(this.root);
  }

  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
    this.focusPanel(visible);
  }

  public dispose(): void {
    this.focusPanel(false);
    this.root.remove();
  }
}
