/**
 * Lightweight toast notification banner for clipboard actions and status cues.
 */
export class ToastManager {
  private readonly container: HTMLDivElement;

  constructor(uiRoot: HTMLElement) {
    this.container = document.createElement('div');
    this.container.style.cssText =
      'position:absolute;right:20px;bottom:20px;display:flex;flex-direction:column;gap:8px;z-index:50;pointer-events:none;';
    uiRoot.appendChild(this.container);
  }

  /** Displays a temporary toast message. */
  public show(message: string, durationMs = 2600): void {
    const el = document.createElement('div');
    el.textContent = message;
    el.style.cssText =
      'background:rgba(20,19,17,0.92);color:#f5ebd6;border:1px solid rgba(245,200,76,0.55);padding:9px 14px;border-radius:6px;font-size:13px;font-weight:600;box-shadow:0 6px 18px rgba(0,0,0,0.4);';
    this.container.appendChild(el);
    window.setTimeout(() => {
      el.remove();
    }, durationMs);
  }

  /** Removes toast container cleanly. */
  public dispose(): void {
    this.container.remove();
  }
}
