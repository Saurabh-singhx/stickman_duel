const panels: HTMLElement[] = [];
/** Keeps keyboard navigation in the visible overlay and restores its opener. */
export function panelFocus(root: HTMLElement, close?: () => void): (visible: boolean) => void {
  let opener: HTMLElement | null = null;
  let active = false;
  const keydown = (event: KeyboardEvent) => {
    if (!active || panels[panels.length - 1] !== root) return;
    if (root.dataset.rebinding) return;
    if (event.key === 'Escape' && close) {
      event.preventDefault();
      event.stopImmediatePropagation();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = [...root.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]')]
      .filter(el => el.getClientRects().length > 0);
    const first = items[0], last = items[items.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) {
      event.preventDefault(); last.focus();
    } else if (!event.shiftKey && (document.activeElement === last || !root.contains(document.activeElement))) {
      event.preventDefault(); first.focus();
    }
  };
  return visible => {
    const index = panels.indexOf(root);
    if (index >= 0) panels.splice(index, 1);
    if (visible) panels.push(root);
    active = visible;
    if (visible) {
      opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      window.addEventListener('keydown', keydown, true);
      root.querySelector<HTMLElement>('button, input, select')?.focus();
    } else {
      window.removeEventListener('keydown', keydown, true);
      if (opener?.isConnected) opener.focus();
    }
  };
}
