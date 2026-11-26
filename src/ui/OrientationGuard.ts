type WebkitDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: string) => Promise<void>;
  unlock?: () => void;
};

/** Detects mobile/tablet touch devices (or narrow mobile browser emulators). */
export function isMobileTouchDevice(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const hasTouch = navigator.maxTouchPoints > 0;
  const mobileUa = /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent);
  return coarse || mobileUa || (hasTouch && Math.min(window.innerWidth, window.innerHeight) <= 1024);
}

/** Returns true if the current mobile viewport is in vertical (portrait) orientation. */
export function isMobilePortrait(): boolean {
  if (typeof window === 'undefined') return false;
  const portrait = window.innerHeight > window.innerWidth;
  if (!portrait) return false;
  return isMobileTouchDevice() || window.innerWidth <= 650;
}

/** Checks whether the browser is currently in fullscreen mode. */
export function isFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  const doc = document as WebkitDocument;
  return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
}

/**
 * Attempts to enter true fullscreen and lock the screen to horizontal landscape.
 * Must be invoked inside a user gesture handler for browser permission checks.
 */
export async function enterFullscreenAndLandscape(): Promise<{ fullscreen: boolean; locked: boolean }> {
  let fullscreen = isFullscreenActive();
  if (!fullscreen && typeof document !== 'undefined') {
    const el = document.documentElement as WebkitElement;
    try {
      if (el.requestFullscreen) {
        await el.requestFullscreen({ navigationUI: 'hide' } as FullscreenOptions);
        fullscreen = true;
      } else if (el.webkitRequestFullscreen) {
        await el.webkitRequestFullscreen();
        fullscreen = true;
      }
    } catch {
      fullscreen = isFullscreenActive();
    }
  }

  let locked = false;
  if (typeof screen !== 'undefined' && screen.orientation) {
    const orientation = screen.orientation as LockableOrientation;
    try {
      if (orientation.lock) {
        await orientation.lock('landscape');
        locked = true;
      }
    } catch {
      locked = false;
    }
  }

  return { fullscreen, locked };
}

/** Exits fullscreen cleanly if currently active. */
export async function exitFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !isFullscreenActive()) return;
  const doc = document as WebkitDocument;
  try {
    if (doc.exitFullscreen) {
      await doc.exitFullscreen();
    } else if (doc.webkitExitFullscreen) {
      await doc.webkitExitFullscreen();
    }
  } catch {
    // Ignore rejection when browser denies exit
  }
}

/**
 * Full-screen animated overlay enforcing horizontal landscape play on mobile devices.
 * Displays a rotating phone animation, sword icon, and a direct Fullscreen Landscape CTA.
 */
export class OrientationGuard {
  private readonly root: HTMLDivElement;
  private readonly statusHint: HTMLParagraphElement;
  private readonly onPortraitChange: (portrait: boolean) => void;
  private readonly onFullscreenChange?: (active: boolean) => void;
  private currentlyPortrait = false;
  private readonly handleViewportChange: () => void;
  private readonly handleFsChange: () => void;

  constructor(
    uiRoot: HTMLElement,
    options: {
      onPortraitChange: (portrait: boolean) => void;
      onFullscreenChange?: (active: boolean) => void;
    },
  ) {
    this.onPortraitChange = options.onPortraitChange;
    this.onFullscreenChange = options.onFullscreenChange;

    this.root = document.createElement('div');
    this.root.className = 'orientation-guard interactive';
    this.root.setAttribute('role', 'dialog');
    this.root.setAttribute('aria-modal', 'true');
    this.root.setAttribute('aria-labelledby', 'orientation-guard-title');

    const card = document.createElement('div');
    card.className = 'orientation-card';

    const badge = document.createElement('div');
    badge.className = 'orientation-badge';
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
      </svg>
      <span>HORIZONTAL FULLSCREEN ARENA</span>
    `;

    // Animated rotating phone + crossed blades SVG
    const visual = document.createElement('div');
    visual.className = 'orientation-anim-stage';
    visual.setAttribute('aria-hidden', 'true');
    visual.innerHTML = `
      <div class="orientation-corners">
        <span class="corner tl"></span>
        <span class="corner tr"></span>
        <span class="corner bl"></span>
        <span class="corner br"></span>
      </div>
      <div class="orientation-arc">
        <svg viewBox="0 0 120 120" fill="none">
          <path d="M96 36 A44 44 0 0 0 32 28" stroke="currentColor" stroke-width="2.5" stroke-dasharray="5 4" stroke-linecap="round"/>
          <path d="M35 20 L27 29 L38 33" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="orientation-phone">
        <div class="orientation-phone-notch"></div>
        <div class="orientation-phone-screen">
          <svg viewBox="0 0 36 36" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 29L27 9M22 8l6 1-1 6M9 12l5 5M29 29L19 19" stroke="#f5c84c"/>
            <path d="M7 9l20 20M14 8l-6 1 1 6" stroke="#fbf8f0"/>
          </svg>
        </div>
        <div class="orientation-phone-bar"></div>
      </div>
    `;

    const title = document.createElement('h2');
    title.id = 'orientation-guard-title';
    title.className = 'orientation-title';
    title.textContent = 'Rotate to Landscape';

    const desc = document.createElement('p');
    desc.className = 'orientation-desc';
    desc.textContent =
      'Stickman Duel is built for horizontal widescreen combat with dual thumb controls. Turn your device sideways to enter the arena.';

    const cta = document.createElement('button');
    cta.type = 'button';
    cta.className = 'orientation-cta';
    cta.dataset.testid = 'btn-enter-landscape';
    cta.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="2" y="6" width="20" height="12" rx="2"/>
        <path d="M12 12h.01M8 3l-2 2M16 3l2 2"/>
      </svg>
      <span>Enter Fullscreen Landscape</span>
    `;

    this.statusHint = document.createElement('p');
    this.statusHint.className = 'orientation-hint';
    this.statusHint.textContent = 'Auto-rotates on supported devices · Unlock screen rotation if needed';

    cta.onclick = async () => {
      const { locked } = await enterFullscreenAndLandscape();
      this.sync();
      if (!locked && isMobilePortrait()) {
        this.statusHint.textContent =
          'Your browser requires manual rotation — please turn your phone sideways to continue.';
        this.statusHint.dataset.warn = 'true';
      }
    };

    card.append(badge, visual, title, desc, cta, this.statusHint);
    this.root.appendChild(card);
    uiRoot.appendChild(this.root);

    this.handleViewportChange = () => this.sync();
    this.handleFsChange = () => {
      this.onFullscreenChange?.(isFullscreenActive());
      this.sync();
    };

    window.addEventListener('resize', this.handleViewportChange);
    window.addEventListener('orientationchange', this.handleViewportChange);
    document.addEventListener('fullscreenchange', this.handleFsChange);
    document.addEventListener('webkitfullscreenchange', this.handleFsChange);
    screen.orientation?.addEventListener?.('change', this.handleViewportChange);

    this.sync();
  }

  public isPortraitBlocked(): boolean {
    return this.currentlyPortrait;
  }

  public sync(): void {
    const portrait = isMobilePortrait();
    const changed = portrait !== this.currentlyPortrait;
    this.currentlyPortrait = portrait;
    this.root.classList.toggle('visible', portrait);
    this.root.setAttribute('aria-hidden', String(!portrait));
    if (!portrait) {
      delete this.statusHint.dataset.warn;
      this.statusHint.textContent = 'Auto-rotates on supported devices · Unlock screen rotation if needed';
    }
    if (changed) {
      this.onPortraitChange(portrait);
    }
  }

  public dispose(): void {
    window.removeEventListener('resize', this.handleViewportChange);
    window.removeEventListener('orientationchange', this.handleViewportChange);
    document.removeEventListener('fullscreenchange', this.handleFsChange);
    document.removeEventListener('webkitfullscreenchange', this.handleFsChange);
    screen.orientation?.removeEventListener?.('change', this.handleViewportChange);
    this.root.remove();
  }
}
