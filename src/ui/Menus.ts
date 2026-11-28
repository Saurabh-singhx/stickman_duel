import { normalizeRoomCode } from '../net/Rooms';
import { CHARACTERS } from '../data/characters';
import type { DifficultyId } from '../data/enemies';
import { STAGES, STAGE_LIST, type StageId } from '../data/stages';
import { getDailyChallenge, loadProgress, claimDailyInvitation, DAILY_BOSSES, type DailyBossId } from '../systems/Progress';
import { loadSettings } from '../systems/Settings';
import { loadStats } from '../systems/Stats';
import { formatKeyCode } from './CombatGuide';

/** Actions triggered by the Main Menu UI. */
export type MenuAction =
  | { readonly type: 'QUICK_PLAY'; readonly stageId: StageId; readonly difficulty: DifficultyId }
  | { readonly type: 'LOCAL_2P'; readonly stageId: StageId }
  | { readonly type: 'VS_BOT'; readonly difficulty: DifficultyId; readonly stageId: StageId }
  | { readonly type: 'BOSS_RUSH' }
  | { readonly type: 'WAVES' }
  | { readonly type: 'TRAINING'; readonly stageId: StageId }
  | { readonly type: 'GHOST_DUEL' }
  | { readonly type: 'DAILY_CHALLENGE'; readonly enemyChar: DailyBossId; readonly dateKey: string }
  | { readonly type: 'HOST_ROOM'; readonly stageId: StageId }
  | { readonly type: 'JOIN_ROOM'; readonly code: string }
  | { readonly type: 'IMPORT_REPLAY'; readonly code: string }
  | { readonly type: 'OPEN_SETTINGS' }
  | { readonly type: 'TOGGLE_FULLSCREEN' };

/**
 * Minimalist cinematic main menu featuring a single prominent PLAY CTA,
 * secondary single/local/online modes, room codes, daily challenge, and replay import.
 */
export class MenuView {
  private readonly root: HTMLDivElement;
  private selectedStage: StageId = 'beige_plain';
  private selectedBoss: DailyBossId = 'vesper';
  private dailyExpanded = claimDailyInvitation();
  private invitationDay = getDailyChallenge().dateKey;
  private selectedDiff: DifficultyId = 'normal';
  private readonly onAction: (action: MenuAction) => void;
  private readonly onStageChange?: (stageId: StageId) => void;

  constructor(uiRoot: HTMLElement, onAction: (action: MenuAction) => void, onStageChange?: (stageId: StageId) => void) {
    this.onStageChange = onStageChange;
    this.onAction = onAction;
    this.root = document.createElement('div');
    this.root.className = 'menu-overlay interactive';
    this.root.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:space-between;padding:34px 48px;background:linear-gradient(90deg, rgba(20,19,17,0.86) 0%, rgba(20,19,17,0.52) 48%, rgba(20,19,17,0.18) 100%);z-index:20;';
    uiRoot.appendChild(this.root);
    this.render();
  }

  /** Shows or hides the main menu, refreshing live stats and daily info on show. */
  public setVisible(visible: boolean): void {
    this.root.style.display = visible ? 'flex' : 'none';
    if (visible) {
      const today = getDailyChallenge().dateKey;
      if (today !== this.invitationDay) {
        this.invitationDay = today;
        this.dailyExpanded = claimDailyInvitation();
      }
      this.render();
    }
  }

  private render(): void {
    const progress = loadProgress();
    const stats = loadStats();
    const daily = getDailyChallenge();
    const dailyBest = progress.dailyBestScores[daily.dateKey] ?? 0;

    this.root.textContent = '';

    // Header
    const header = document.createElement('div');
    header.className = 'menu-header';
    const titleWrap = document.createElement('div');
    const title = document.createElement('h1');
    title.textContent = 'Stickman Duel';
    title.style.cssText =
      'font-size:52px;font-weight:900;letter-spacing:10px;color:#fbf8f0;text-shadow:0 0 28px rgba(255,213,90,0.45);';
    const sub = document.createElement('div');
    sub.textContent = 'TIMING • PARRY • COUNTER • EXECUTE';
    sub.style.cssText = 'font-size:12px;letter-spacing:4px;color:#d8c9a8;margin-top:4px;';
    titleWrap.append(title, sub);

    const fsBtn = document.createElement('button');
    fsBtn.type = 'button';
    fsBtn.className = 'menu-fullscreen-btn';
    fsBtn.dataset.testid = 'btn-menu-fullscreen';
    fsBtn.setAttribute('aria-label', 'Toggle fullscreen landscape');
    fsBtn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/></svg><span>Fullscreen</span>';
    fsBtn.onclick = () => this.onAction({ type: 'TOGGLE_FULLSCREEN' });

    header.append(titleWrap, fsBtn);

    // Main controls column
    const col = document.createElement('div');
    col.className = 'menu-controls';

    const playBtn = this.makeBtn('Enter the arena', true);
    playBtn.dataset.testid = 'btn-play';
    playBtn.onclick = () => this.onAction({ type: 'QUICK_PLAY', stageId: this.selectedStage, difficulty: this.selectedDiff });
    col.appendChild(playBtn);

    // Stage & Difficulty compact selectors
    const selectors = document.createElement('div');
    selectors.className = 'match-selectors';
    const stageSel = document.createElement('select');
    stageSel.setAttribute('aria-label', 'Arena');
    stageSel.style.cssText =
      'flex:1;padding:8px 10px;background:rgba(28,26,23,0.92);color:#f4efe6;border:1px solid rgba(255,255,255,0.2);border-radius:6px;font-size:16px;';
    for (const st of STAGE_LIST) {
      const opt = document.createElement('option');
      opt.value = st;
      opt.textContent = `Stage: ${STAGES[st].name}`;
      if (st === this.selectedStage) opt.selected = true;
      stageSel.appendChild(opt);
    }
    stageSel.onchange = () => {
      this.selectedStage = stageSel.value as StageId;
      this.onStageChange?.(this.selectedStage);
    };

    const diffSel = document.createElement('select');
    diffSel.setAttribute('aria-label', 'Bot difficulty');
    diffSel.style.cssText = stageSel.style.cssText;
    for (const d of ['easy', 'normal', 'hard', 'master'] as const) {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = `Bot: ${d.toUpperCase()}`;
      if (d === this.selectedDiff) opt.selected = true;
      diffSel.appendChild(opt);
    }
    diffSel.onchange = () => {
      this.selectedDiff = diffSel.value as DifficultyId;
    };
    selectors.append(stageSel, diffSel);
    col.appendChild(selectors);

    // Mode grid
    const grid = document.createElement('div');
    grid.className = 'mode-grid';

    const addMode = (label: string, testid: string, cb: () => void) => {
      const b = this.makeBtn(label, false);
      b.dataset.testid = testid;
      b.onclick = cb;
      grid.appendChild(b);
    };

    addMode('Vs Bot', 'btn-vs-bot', () =>
      this.onAction({ type: 'VS_BOT', difficulty: this.selectedDiff, stageId: this.selectedStage }),
    );
    addMode('Local 2P', 'btn-local-2p', () =>
      this.onAction({ type: 'LOCAL_2P', stageId: this.selectedStage }),
    );
    addMode(`Boss Rush (${progress.bossRushBestStage}/6)`, 'btn-boss-rush', () =>
      this.onAction({ type: 'BOSS_RUSH' }),
    );
    addMode(`Waves (Best ${progress.wavesBestWave})`, 'btn-waves', () =>
      this.onAction({ type: 'WAVES' }),
    );
    addMode('Training Dojo', 'btn-training', () =>
      this.onAction({ type: 'TRAINING', stageId: this.selectedStage }),
    );
    addMode('Ghost Duel', 'btn-ghost-duel', () => this.onAction({ type: 'GHOST_DUEL' }));
    const dailyToggle = this.makeBtn('Daily Boss Fights', false);
    dailyToggle.dataset.testid = 'daily-toggle';
    dailyToggle.setAttribute('aria-controls', 'daily-boss-panel');
    dailyToggle.setAttribute('aria-expanded', String(this.dailyExpanded));
    grid.appendChild(dailyToggle);
    addMode('Settings', 'btn-settings', () => this.onAction({ type: 'OPEN_SETTINGS' }));
    col.appendChild(grid);

    // Room Code & Replay Import bar
    const netRow = document.createElement('div');
    netRow.className = 'online-grid';
    const hostBtn = this.makeBtn('Host Room', false);
    hostBtn.dataset.testid = 'btn-host-room';
    hostBtn.onclick = () => this.onAction({ type: 'HOST_ROOM', stageId: this.selectedStage });

    const codeInput = document.createElement('input');
    codeInput.setAttribute('aria-label', 'Room code');
    codeInput.placeholder = 'Code or invite link';
    codeInput.maxLength = 2048;
    codeInput.autocomplete = 'off';
    codeInput.spellcheck = false;
    codeInput.setAttribute('aria-describedby', 'room-hint');
    codeInput.dataset.testid = 'input-room-code';
    codeInput.style.cssText =
      'width:118px;padding:8px 10px;background:rgba(28,26,23,0.92);color:#f4efe6;border:1px solid rgba(255,213,90,0.35);border-radius:6px;font-size:16px;text-transform:uppercase;letter-spacing:2px;';

    const joinBtn = this.makeBtn('Join', false);
    joinBtn.disabled = true;
    codeInput.oninput = () => {
      joinBtn.disabled = codeInput.value.trim().length === 0;
      codeInput.removeAttribute('aria-invalid');
      hint.textContent = 'Play online with a friend. Host a room or paste their code or invite link.';
    };
    codeInput.onkeydown = (event) => { if (event.key === 'Enter' && !joinBtn.disabled) joinBtn.click(); };
    joinBtn.dataset.testid = 'btn-join-room';
    joinBtn.onclick = () => {
      const code = normalizeRoomCode(codeInput.value);
      if (!code) {
        hint.textContent = 'Use a 6-character room code (letters and numbers), or paste the full invite link.';
        codeInput.setAttribute('aria-invalid', 'true');
        codeInput.focus();
        return;
      }
      this.onAction({ type: 'JOIN_ROOM', code });
    };

    const importBtn = this.makeBtn('Import Replay', false);
    importBtn.onclick = () => {
      const code = window.prompt('Paste a Stickman Duel replay code:');
      if (code && code.trim().length > 0) {
        this.onAction({ type: 'IMPORT_REPLAY', code });
      }
    };
    const joinGroup = document.createElement('div');
    joinGroup.className = 'join-controls';
    joinGroup.append(codeInput, joinBtn);
    netRow.append(hostBtn, joinGroup, importBtn);
    const hint = document.createElement('p');
    hint.id = 'room-hint';
    hint.className = 'room-hint';
    hint.setAttribute('aria-live', 'polite');
    hint.textContent = 'Play online with a friend. Host a room or paste their code or invite link.';
    col.append(netRow, hint);

    // Footer controls hint & stats
    const footer = document.createElement('div');
    footer.style.cssText = 'display:flex;justify-content:space-between;font-size:12px;color:#cfc7b8;';
    const k = loadSettings().p1Keys;
    const controls = document.createElement('span');
    controls.textContent =
      `P1: ${formatKeyCode(k.left)}/${formatKeyCode(k.right)} Move • ${formatKeyCode(k.up)} Jump • ${formatKeyCode(k.down)} Crouch • ${formatKeyCode(k.dodge)} Dodge • LMB/${formatKeyCode(k.light)} Light • RMB/${formatKeyCode(k.heavy)} Heavy • ${formatKeyCode(k.down)}+RMB/${formatKeyCode(k.heavy)} Red • ${formatKeyCode(k.block)} Block/Parry • ${formatKeyCode(k.grab)} Grab • ${formatKeyCode(k.special)} Special  •  F1 Hitboxes`;
    const statLine = document.createElement('span');
    statLine.textContent = `Wins: ${stats.matchesWon}/${stats.matchesPlayed} • Parries: ${stats.totalParries} • Daily Best: ${dailyBest}`;
    footer.append(controls, statLine);

    const body = document.createElement('div');
    body.className = 'menu-body';
    const feature = document.createElement('section');
    feature.id = 'daily-boss-panel';
    feature.className = 'daily-feature';
    feature.setAttribute('aria-label', 'Choose a daily boss');
    feature.hidden = !this.dailyExpanded;
    col.hidden = this.dailyExpanded;
    dailyToggle.onclick = () => {
      this.dailyExpanded = !this.dailyExpanded;
      feature.hidden = !this.dailyExpanded;
      col.hidden = this.dailyExpanded;
      feature.querySelector<HTMLElement>('button, select')?.focus();
      dailyToggle.setAttribute('aria-expanded', String(this.dailyExpanded));
    };

    const heading = document.createElement('h2');
    heading.textContent = 'Daily boss fights';
    const intro = document.createElement('p');
    intro.textContent = 'Fight any boss in today’s seeded arena. Come back and challenge another whenever you like.';
    const label = document.createElement('label');
    label.textContent = 'Opponent';
    label.htmlFor = 'daily-boss-select';
    const bossSelect = document.createElement('select');
    bossSelect.id = 'daily-boss-select';
    bossSelect.dataset.testid = 'daily-boss-select';
    bossSelect.style.cssText = stageSel.style.cssText + 'width:100%;margin:8px 0;';
    for (const id of DAILY_BOSSES) {
      const option = document.createElement('option');
      option.value = id;
      option.textContent = CHARACTERS[id].name;
      bossSelect.appendChild(option);
    }
    bossSelect.value = this.selectedBoss;
    const description = document.createElement('p');
    description.className = 'daily-tactics';
    const tactics: Record<DailyBossId, string> = {
      vesper: 'Jump the violet tide. Parry the astral strikes.',
      raijin: 'Jump the arc surge. Parry the lightning dashes.',
      swordsman: 'Close the distance carefully. Parry the blade waves.',
      brawler: 'Watch the heavy windups. Jump the floor attacks.',
      assassin: 'Expect quick pressure. Time your dodge and counter.',
      warden: 'Watch the floor. Jump low waves and parry the cleaves.',
    };
    const meta = document.createElement('p');
    meta.className = 'daily-meta';
    meta.textContent = `${STAGES[daily.stageId].name} · Hard · ${daily.enableHazards ? 'Hazards on' : 'Hazards off'} · ${daily.dateKey} · Resets 00:00 UTC · Daily best across bosses: ${dailyBest}`;
    const dailyBtn = this.makeBtn('', false);
    dailyBtn.dataset.testid = 'btn-daily';
    const updateBoss = () => {
      description.textContent = `${CHARACTERS[this.selectedBoss].title}. ${tactics[this.selectedBoss]}`;
      this.setCardContent(dailyBtn, `Fight ${CHARACTERS[this.selectedBoss].name}`, 'Start this daily boss encounter', 'swords');
    };
    bossSelect.onchange = () => {
      this.selectedBoss = bossSelect.value as DailyBossId;
      updateBoss();
    };
    updateBoss();
    dailyBtn.onclick = () => this.onAction({
      type: 'DAILY_CHALLENGE', enemyChar: this.selectedBoss, dateKey: getDailyChallenge().dateKey,
    });
    const dismiss = this.makeBtn('Not now', false);
    dismiss.dataset.testid = 'btn-dismiss-daily';
    dismiss.onclick = () => {
      this.dailyExpanded = false;
      feature.hidden = true;
      col.hidden = false;
      dailyToggle.setAttribute('aria-expanded', 'false');
      dailyToggle.focus();
    };
    dismiss.querySelector('.control-title')!.textContent = 'Back to modes';
    dismiss.querySelector('.control-description')!.textContent = 'Return to the main menu';
    const bossGrid = document.createElement('div');
    bossGrid.className = 'boss-choice-grid';
    const bossCards: HTMLButtonElement[] = [];
    for (const id of DAILY_BOSSES) {
      const card = this.makeBtn(CHARACTERS[id].name, false);
      this.setCardContent(card, CHARACTERS[id].name, CHARACTERS[id].title, 'crown');
      card.setAttribute('aria-pressed', String(this.selectedBoss === id));
      card.onclick = () => {
        this.selectedBoss = id;
        bossSelect.value = id;
        updateBoss();
        bossCards.forEach((button, i) => button.setAttribute('aria-pressed', String(DAILY_BOSSES[i] === id)));
      };
      bossCards.push(card);
      bossGrid.appendChild(card);
    }
    const launch = document.createElement('div');
    launch.className = 'daily-launch';
    launch.append(description, meta, dailyBtn);
    feature.append(dismiss, heading, intro, bossGrid, launch);
    const modesTitle = document.createElement('h2');
    modesTitle.textContent = 'Choose your fight';
    modesTitle.className = 'menu-section-title';
    col.insertBefore(modesTitle, grid);
    const onlineTitle = document.createElement('h2');
    onlineTitle.textContent = 'Play together';
    onlineTitle.className = 'menu-section-title';
    col.insertBefore(onlineTitle, netRow);
    body.append(col, feature);
    this.root.append(header, body, footer);
  }

  private makeBtn(label: string, primary: boolean): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = primary ? 'control-card control-card-primary' : 'control-card';
    const descriptions: Array<[string, string, string]> = [
      ['Enter the arena', 'Quick play using your selected arena and difficulty', 'swords'],
      ['Vs Bot', 'Practice your timing against an AI opponent', 'target'],
      ['Local 2P', 'Two players. One keyboard. Settle the score.', 'players'],
      ['Boss Rush', 'Take on six increasingly difficult encounters', 'crown'],
      ['Waves', 'Survive an endless sequence of opponents', 'waves'],
      ['Training Dojo', 'Learn your moves with no pressure to win', 'target'],
      ['Ghost Duel', 'Challenge a recorded opponent', 'ghost'],
      ['Daily Boss Fights', 'Choose from six bosses in today’s arena', 'crown'],
      ['Settings', 'Tune audio, visuals and key bindings', 'settings'],
      ['Host Room', 'Create a room and invite a friend', 'players'],
      ['Join', 'Enter a friend’s room code to connect', 'arrow'],
      ['Import Replay', 'Load a saved fight from its replay code', 'replay'],
      ['Not now', 'Close the daily selector and keep browsing', 'arrow'],
    ];
    const item = descriptions.find(([prefix]) => label.startsWith(prefix));
    this.setCardContent(btn, label, item?.[1] ?? 'Choose your opponent and begin', item?.[2] ?? 'swords');
    return btn;
  }

  private setCardContent(btn: HTMLButtonElement, label: string, description: string, icon: string): void {
    const paths: Record<string, string> = {
      swords: 'M4 3l13 13m-3 0 5 5m-3-2 3-3M20 3L7 16m3 0-5 5m3-2-3-3M4 3l1 5 3-3m12-2-1 5-3-3',
      target: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10M12 10v4m-2-2h4',
      players: 'M8 4a3 3 0 1 0 0 6 3 3 0 0 0 0-6M2 20v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6m0 3a5 5 0 0 1 5 5v1',
      crown: 'M3 6l4 5 5-7 5 7 4-5-2 12H5L3 6m3 15h12',
      waves: 'M2 6q3-4 6 0t6 0 8 0M2 12q3-4 6 0t6 0 8 0M2 18q3-4 6 0t6 0 8 0',
      ghost: 'M5 21V10a7 7 0 0 1 14 0v11l-4-3-3 3-3-3-4 3M9 9v3m6-3v3',
      settings: 'M5 3v6m0 4v8M12 3v11m0 4v3M19 3v3m0 4v11M2 9h6v4H2V9m7 5h6v4H9v-4m7-8h6v4h-6V6',
      arrow: 'M4 12h16m-6-6 6 6-6 6',
      replay: 'M4 9a9 9 0 1 1 0 7M4 3v6h6m0 0 6 4-6 4V9',
    };
    btn.textContent = '';
    const artwork = document.createElement('span');
    artwork.className = 'control-icon';
    artwork.setAttribute('aria-hidden', 'true');
    artwork.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[icon] ?? paths.swords}"/></svg>`;
    const copy = document.createElement('span');
    copy.className = 'control-copy';
    const title = document.createElement('span');
    title.className = 'control-title';
    title.textContent = label;
    const hint = document.createElement('span');
    hint.className = 'control-description';
    hint.textContent = description;
    copy.append(title, hint);
    btn.append(artwork, copy);
  }

  public dispose(): void {
    this.root.remove();
  }
}
