import { CHARACTERS } from './data/characters';
import { AudioEngine } from './audio/AudioEngine';
import { AdaptiveMusic } from './audio/Music';
import { SfxController } from './audio/Sfx';
import { BALANCE } from './data/balance';
import { FINISHERS } from './data/finishers';
import { PLAYER_SPECIALS } from './data/specials';
import type { StageId } from './data/stages';
import { DebugOverlay } from './debug/DebugOverlay';
import { FrameStepController } from './debug/FrameStep';
import { InputMapper } from './input/InputMapper';
import { BossRushMode } from './modes/BossRush';
import { GhostDuelMode } from './modes/GhostDuel';
import { Local2PMode, type GameMode } from './modes/Local2P';
import { OnlineMode } from './modes/Online';
import { VsBotMode } from './modes/VsBot';
import { WavesMode } from './modes/Waves';
import { generateRoomCode, getInviteRoomFromUrl, normalizeRoomCode } from './net/Rooms';
import { WebRtcTransport } from './net/WebRtcTransport';
import { GhostStore } from './replay/GhostStore';
import { decodeReplayCode, encodeReplayCode, type ReplayRecording } from './replay/Recorder';
import { HudView } from './render/Hud';
import { Renderer } from './render/Renderer';
import { createInitialState, step } from './sim/Sim';
import { hashState } from './sim/Snapshot';
import type { GameState } from './sim/State';
import { getDailyChallenge, loadProgress, saveProgress } from './systems/Progress';
import {
  initAnalytics,
  trackEvent,
  trackMatchEnded,
  trackModeStarted,
  trackOnlineStatus,
} from './systems/Analytics';
import { loadSettings, saveSettings, toRenderOptions, type UserSettings } from './systems/Settings';
import { recordMatchStats } from './systems/Stats';
import { RoomLobby } from './ui/RoomLobby';
import { MenuView, type MenuAction } from './ui/Menus';
import {
  OrientationGuard,
  enterFullscreenAndLandscape,
  exitFullscreen,
  isFullscreenActive,
  isMobileTouchDevice,
} from './ui/OrientationGuard';
import { PauseView } from './ui/Pause';
import { ResultsView } from './ui/Results';
import { SettingsView } from './ui/Settings';
import { ToastManager } from './ui/Toasts';

interface DuskbladeDebugApi {
  getState(): GameState;
  getHash(): number;
  getSceneMetrics(): { active: number; disposed: number };
  startAction(action: MenuAction): void;
  setCustomState(state: GameState): void;
  toggleDebugOverlay(): boolean;
  toggleFrameStep(): boolean;
  stepOneFrame(): void;
  testSceneSwitches(count: number): { active: number; disposed: number };
}

declare global {
  interface Window {
    __DUSKBLADE__?: DuskbladeDebugApi;
  }
}

async function bootstrap(): Promise<void> {
  const canvasHost = document.getElementById('canvas-host');
  const uiRoot = document.getElementById('ui-root');
  if (!canvasHost || !uiRoot) return;

  initAnalytics();
  let settings: UserSettings = loadSettings();
  const renderer = new Renderer();
  await renderer.init(canvasHost);

  const audio = new AudioEngine();
  audio.setVolumes(settings.volumes);
  const sfx = new SfxController(audio);
  const music = new AdaptiveMusic(audio);

  const input = new InputMapper(uiRoot, settings.p1Keys, settings.p2Keys, settings.gamepad);
  input.touch.setVisible(false);

  const hud = new HudView(uiRoot);
  const debugOverlay = new DebugOverlay(uiRoot);
  const frameStep = new FrameStepController();
  const toasts = new ToastManager(uiRoot);
  const ghostStore = new GhostStore();

  // Sub-status bar (e.g. Training hints, Boss Rush title, Room code status)
  const subStatusEl = document.createElement('div');
  subStatusEl.style.cssText =
    'position:absolute;top:88px;left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;letter-spacing:1.5px;color:#f5ebd6;background:rgba(20,19,17,0.72);padding:4px 12px;border-radius:5px;display:none;z-index:15;';
  uiRoot.appendChild(subStatusEl);

  let mode: GameMode | null = null;
  let lastAction: MenuAction = { type: 'QUICK_PLAY', stageId: 'beige_plain', difficulty: 'normal' };
  let lastRecording: ReplayRecording | null = null;
  let paused = false;
  let resultsShown = false;
  let matchStartMs = 0;
  let customPreviewState: GameState | null = null;
  let orientationGuard: OrientationGuard | null = null;

  const gameHost = document.getElementById('app')!;
  const setCombatCapture = (active: boolean) => {
    gameHost.classList.toggle('combat-active', active);
    input.mouse.setCombatActive(active);
    const touchEnabled =
      settings.touchMode === 'on' ||
      (settings.touchMode === 'auto' && (settings.touchControls || isMobileTouchDevice()));
    const showTouch = active && touchEnabled && !(orientationGuard?.isPortraitBlocked() ?? false);
    input.touch.configure(settings.touchSize, settings.touchOpacity);
    input.touch.setFullscreenState(isFullscreenActive());
    input.touch.setVisible(showTouch);
    hud.setTouchMode(showTouch);
    // Clear held controls across UI transitions.
    window.dispatchEvent(new Event('blur'));
    if (active) {
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      if (window.matchMedia('(pointer: fine)').matches && !document.pointerLockElement) {
        try {
          const request = gameHost.requestPointerLock?.();
          if (request) void request.catch(() => {});
        } catch { /* Cursor hiding still works if pointer lock is unavailable. */ }
      }
    } else if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  };

  // Ambient menu backdrop state
  let menuDemoState: GameState = createInitialState({
    seed: 101,
    stageId: 'beige_plain',
    p1Char: 'hero',
    p2Char: 'swordsman',
    roundsToWin: 99,
    roundTimerFrames: 0,
    enableHazards: false,
    parryAssist: false,
    infiniteGuardP2: false,
    trainingMode: true,
  });

  const unlockAudioOnce = () => audio.unlock();
  window.addEventListener('pointerdown', unlockAudioOnce, { once: true });
  window.addEventListener('keydown', unlockAudioOnce, { once: true });

  const startMode = (nextMode: GameMode, action: MenuAction) => {
    roomLobby.hide();
    mode?.dispose();
    mode = nextMode;
    lastAction = action;
    lastRecording = null;
    customPreviewState = null;
    paused = false;
    resultsShown = false;
    matchStartMs = performance.now();
    frameStep.enabled = false;
    lastEventFrame = -1;

    const st = nextMode.getState();
    trackModeStarted({
      action,
      modeId: nextMode.id,
      stageId: st.config.stageId,
      touchDevice: isMobileTouchDevice(),
    });
    renderer.mountScene(st.config.p1Char, st.config.p2Char);
    menus.setVisible(false);
    setCombatCapture(true);
    pauseView.setVisible(false);
    resultsView.hide();
    hud.setVisible(true);
    hud.showBanner(nextMode.title, 70);
    audio.setPaused(false);
    activeStageId = st.config.stageId;
    music.start(st.config.stageId, st.config.seed);

    debugOverlay.setVisible(nextMode.id === 'training' && navigator.maxTouchPoints === 0);
  };

  const returnToMenu = () => {
    roomLobby.hide();
    setCombatCapture(false);
    mode?.dispose();
    mode = null;
    customPreviewState = null;
    paused = false;
    resultsShown = false;
    music.stop();
    hud.setVisible(false);
    subStatusEl.style.display = 'none';
    pauseView.setVisible(false);
    resultsView.hide();
    menus.setVisible(true);
  };

  const handleMenuAction = (action: MenuAction) => {
    audio.unlock();
    sfx.playUiTick(true);

    if (action.type === 'TOGGLE_FULLSCREEN') {
      if (isFullscreenActive()) {
        void exitFullscreen();
      } else {
        void enterFullscreenAndLandscape();
      }
      return;
    }

    if (action.type !== 'OPEN_SETTINGS' && isMobileTouchDevice()) {
      void enterFullscreenAndLandscape();
    }

    switch (action.type) {
      case 'QUICK_PLAY': {
        const ghost = ghostStore.pick(0);
        if (ghost && action.stageId === ghost.config.stageId) {
          toasts.show('Matched against a recorded Ghost Duelist');
          startMode(new GhostDuelMode(ghost, false), action);
        } else {
          toasts.show(`Launching vs Bot on ${action.stageId.replace('_', ' ')}`);
          startMode(
            new VsBotMode({
              difficulty: action.difficulty,
              stageId: action.stageId,
              parryAssist: settings.parryAssist,
              titleOverride: 'Quick Play',
              p2LabelOverride: 'Training Bot',
            }),
            action,
          );
        }
        break;
      }
      case 'LOCAL_2P':
        startMode(new Local2PMode({ stageId: action.stageId, parryAssist: settings.parryAssist }), action);
        break;
      case 'VS_BOT':
        startMode(
          new VsBotMode({
            difficulty: action.difficulty,
            stageId: action.stageId,
            parryAssist: settings.parryAssist,
          }),
          action,
        );
        break;
      case 'BOSS_RUSH':
        startMode(new BossRushMode(settings.parryAssist), action);
        break;
      case 'WAVES':
        startMode(new WavesMode(settings.parryAssist), action);
        break;
      case 'TRAINING':
        startMode(
          new Local2PMode({
            stageId: action.stageId,
            trainingMode: true,
            infiniteGuardP2: true,
            parryAssist: settings.parryAssist,
          }),
          action,
        );
        break;
      case 'GHOST_DUEL': {
        const ghost = ghostStore.pick(0);
        if (ghost) {
          startMode(new GhostDuelMode(ghost, false), action);
        } else {
          toasts.show('No saved ghosts yet — starting Training Bot to record your first ghost!');
          startMode(
            new VsBotMode({
              difficulty: 'normal',
              stageId: 'dusk_desert',
              parryAssist: settings.parryAssist,
              p2LabelOverride: 'Training Bot',
            }),
            action,
          );
        }
        break;
      }
      case 'DAILY_CHALLENGE': {
        const daily = getDailyChallenge();
        startMode(
          new VsBotMode({
            difficulty: 'hard',
            enemyChar: action.enemyChar,
            stageId: daily.stageId,
            seed: daily.seed,
            enableHazards: daily.enableHazards,
            parryAssist: settings.parryAssist,
            titleOverride: `Daily ${daily.dateKey}`,
            p2LabelOverride: CHARACTERS[action.enemyChar].name,
            behavior: 'boss',
          }),
          action,
        );
        break;
      }
      case 'HOST_ROOM':
      case 'JOIN_ROOM': {
        const isHost = action.type === 'HOST_ROOM';
        const roomId = isHost ? generateRoomCode() : normalizeRoomCode(action.code);
        if (!roomId) {
          toasts.show('Enter a 6-character room code or paste an invite link.');
          return;
        }
        const stageId = isHost ? action.stageId : 'beige_plain';
        const transport = new WebRtcTransport((status, message) => {
          roomLobby.update(status, message);
          setCombatCapture(status === 'connected');
          trackOnlineStatus(status, isHost, stageId);
        });
        startMode(new OnlineMode({
          transport, roomId, isHost,
          seed: isHost ? (Date.now() & 0xffffff) || 404 : 1,
          stageId,
        }), action);
        roomLobby.show(roomId, isHost);
        setCombatCapture(false);
        break;
      }
      case 'IMPORT_REPLAY': {
        try {
          const rec = decodeReplayCode(action.code);
          startMode(new GhostDuelMode(rec, true), action);
          trackEvent('replay_imported', { stageId: rec.config.stageId });
          toasts.show(`Playing replay: ${rec.label}`);
        } catch {
          toasts.show('Invalid replay code');
        }
        break;
      }
      case 'OPEN_SETTINGS':
        settingsView.setVisible(true, settings);
        break;
    }
  };

  const roomLobby = new RoomLobby(uiRoot, returnToMenu, () => handleMenuAction(lastAction));

  const menus = new MenuView(uiRoot, handleMenuAction, (stageId) => {
    menuDemoState = { ...menuDemoState, config: { ...menuDemoState.config, stageId } };
  });

  const settingsView = new SettingsView(
    uiRoot,
    settings,
    (next) => {
      settings = next;
      saveSettings(next);
      audio.setVolumes(next.volumes);
      input.keyboard.setBindings(0, next.p1Keys);
      input.keyboard.setBindings(1, next.p2Keys);
      input.gamepad.setMapping(next.gamepad);
      input.touch.configure(next.touchSize, next.touchOpacity);
      if (mode && !paused && !resultsShown) {
        setCombatCapture(true);
      }
    },
    () => {
      settingsView.setVisible(false);
    },
  );

  const pauseView = new PauseView(uiRoot, {
    onResume: () => {
      if (isMobileTouchDevice()) {
        void enterFullscreenAndLandscape();
      }
      paused = false;
      pauseView.setVisible(false);
      audio.setPaused(false);
      setCombatCapture(true);
    },
    onRestart: () => handleMenuAction(lastAction),
    onSettings: () => settingsView.setVisible(true, settings),
    onFullscreen: () => {
      if (isFullscreenActive()) {
        void exitFullscreen();
      } else {
        void enterFullscreenAndLandscape();
      }
    },
    onMainMenu: returnToMenu,
  });

  const resultsView = new ResultsView(uiRoot, {
    onRematch: () => handleMenuAction(lastAction),
    onCopyReplay: () => {
      if (!lastRecording) return;
      const code = encodeReplayCode(lastRecording);
      void navigator.clipboard?.writeText(code).catch(() => {});
      trackEvent('replay_copied', { modeId: mode?.id ?? 'unknown' });
      toasts.show(`Replay code copied (${code.length} chars)`);
    },
    onMainMenu: returnToMenu,
  });

  document.addEventListener('pointerlockchange', () => {
    if (!document.pointerLockElement && mode && !paused && !resultsShown &&
        gameHost.classList.contains('combat-active')) {
      paused = true;
      setCombatCapture(false);
      pauseView.setVisible(true);
      audio.setPaused(true);
    }
  });

  input.touch.onPause = () => {
    if (!mode || paused || resultsShown) return;
    paused = true;
    setCombatCapture(false);
    pauseView.setVisible(true);
    audio.setPaused(true);
  };
  input.touch.onToggleFullscreen = () => {
    if (isFullscreenActive()) {
      void exitFullscreen();
    } else {
      void enterFullscreenAndLandscape();
    }
  };
  orientationGuard = new OrientationGuard(uiRoot, {
    onPortraitChange: (portrait) => {
      if (portrait && mode && !paused && !resultsShown) {
        paused = true;
        setCombatCapture(false);
        pauseView.setVisible(true);
        audio.setPaused(true);
      } else if (!portrait && mode && !paused && !resultsShown) {
        setCombatCapture(true);
      }
      requestAnimationFrame(() => renderer.app.resize());
    },
    onFullscreenChange: (active) => {
      input.touch.setFullscreenState(active);
      requestAnimationFrame(() => renderer.app.resize());
    },
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) input.touch.onPause();
  });

  // Global hotkeys (ESC pause, F1 debug overlay, F2/F3 frame step, F4/F5 training dummy)
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.code === 'Escape' && mode && !resultsShown) {
      if (e.repeat || paused) return;
      // The browser releases pointer lock on Escape; pointerlockchange pauses once.
      if (document.pointerLockElement) return;
      e.preventDefault();
      settingsView.setVisible(false);
      paused = true;
      setCombatCapture(false);
      pauseView.setVisible(paused);
      audio.setPaused(paused);
    } else if (e.code === 'F1') {
      e.preventDefault();
      debugOverlay.toggle();
    } else if (e.code === 'F2') {
      e.preventDefault();
      const on = frameStep.toggle();
      toasts.show(`Frame-Step Mode: ${on ? 'ON (press F3 or .)' : 'OFF'}`);
    } else if (e.code === 'F3' || (frameStep.enabled && e.code === 'Period')) {
      e.preventDefault();
      frameStep.requestStep();
    } else if (e.code === 'F4' && mode instanceof Local2PMode) {
      e.preventDefault();
      const msg = mode.toggleDummyRecord();
      if (msg) toasts.show(msg);
    } else if (e.code === 'F5' && mode instanceof Local2PMode) {
      e.preventDefault();
      const msg = mode.toggleDummyPlayback();
      if (msg) toasts.show(msg);
    }
  });

  // Expose deterministic test/inspection hook for automated Playwright tests
  window.__DUSKBLADE__ = {
    getState: () => customPreviewState ?? mode?.getState() ?? menuDemoState,
    getHash: () => hashState(customPreviewState ?? mode?.getState() ?? menuDemoState),
    getSceneMetrics: () => ({
      active: renderer.activeSceneContainers,
      disposed: renderer.totalDisposedScenes,
    }),
    startAction: (action: MenuAction) => handleMenuAction(action),
    setCustomState: (st: GameState) => {
      customPreviewState = st;
      menus.setVisible(false);
    setCombatCapture(true);
      hud.setVisible(true);
      hud.showBanner('', 1);
      subStatusEl.style.display = 'none';
      debugOverlay.setVisible(false);
      renderer.mountScene(st.config.p1Char, st.config.p2Char);
      renderer.handleEvents(st.events, st, toRenderOptions(settings));
      hud.update(st);
    },
    toggleDebugOverlay: () => debugOverlay.toggle(),
    toggleFrameStep: () => frameStep.toggle(),
    stepOneFrame: () => frameStep.requestStep(),
    testSceneSwitches: (count: number) => {
      const stages: StageId[] = ['beige_plain', 'dusk_desert', 'ruined_hall', 'night_rooftop'];
      for (let i = 0; i < count; i += 1) {
        renderer.mountScene('hero', i % 2 === 0 ? 'swordsman' : 'assassin');
        menuDemoState = { ...menuDemoState, config: { ...menuDemoState.config, stageId: stages[i % 4]! } };
      }
      return {
        active: renderer.activeSceneContainers,
        disposed: renderer.totalDisposedScenes,
      };
    },
  };

  // Fixed 60 Hz simulation accumulator + interpolated rendering loop
  const STEP_MS = 1000 / BALANCE.TICK_RATE;
  let lastTime = performance.now();
  let accumulator = 0;
  let lastSimMs = 0;
  let lastEventFrame = -1;
  let activeStageId: StageId = 'beige_plain';

  const loop = (now: number) => {
    const dt = Math.min(100, now - lastTime);
    lastTime = now;
    const renderOpts = toRenderOptions(settings);

    if (customPreviewState) {
      renderer.render(customPreviewState, customPreviewState, 1, renderOpts);
      debugOverlay.update(
        customPreviewState,
        null,
        0,
        renderer.getDrawLayerCount(),
        frameStep.enabled,
      );
      requestAnimationFrame(loop);
      return;
    }

    if (mode && !paused) {
      if (frameStep.enabled) {
        accumulator = frameStep.consumeShouldStep() ? STEP_MS : 0;
      } else {
        accumulator += dt;
      }
      while (accumulator >= STEP_MS) {
        accumulator -= STEP_MS;

        const t0 = performance.now();
        const st = mode.stepFrame(input, now);
        lastSimMs = performance.now() - t0;

        if (st.frame !== lastEventFrame && st.events.length > 0) {
          lastEventFrame = st.frame;
          renderer.handleEvents(st.events, st, renderOpts);
          sfx.handleEvents(st.events);
        }

        if (st.config.stageId !== activeStageId) {
          activeStageId = st.config.stageId;
          music.start(st.config.stageId, st.config.seed);
        }

        // Adaptive music intensity based on low HP or boss fights
        const minHpRatio = Math.min(st.fighters[0].hp / st.fighters[0].maxHp, st.fighters[1].hp / st.fighters[1].maxHp);
        const isBoss = st.fighters[1].charId === 'warden' || st.fighters[1].charId === 'vesper' || st.config.enableHazards;
        music.setIntensity(isBoss ? Math.max(0.65, 1 - minHpRatio) : Math.max(0, 0.7 - minHpRatio));

        for (const ev of st.events) {
          if (ev.type === 'PARRY') hud.showBanner('PARRY!', 40, '#ffe066');
          else if (ev.type === 'GUARD_BREAK') hud.showBanner('GUARD BREAK', 48, '#ff785a');
          else if (ev.type === 'PERFECT_DODGE') hud.showBanner('PERFECT DODGE', 42, '#93c5fd');
          else if (ev.type === 'FINISHER_START') {
            const fName = FINISHERS[ev.finisherId].name;
            hud.showBanner(fName, ev.finisherId === 'tempest_thunder' ? 140 : 65, '#ffd54f');
          }
          else if (ev.type === 'PLAYER_SPECIAL_START') hud.showBanner(PLAYER_SPECIALS[ev.specialId].name, 85, '#38bdf8');
          else if (ev.type === 'PLAYER_SPECIAL_DENIED') hud.showBanner(ev.reason === 'parry' ? 'SPECIAL PARRIED!' : 'SPECIAL DODGED!', 55, '#ffe066');
          else if (ev.type === 'BOSS_SPECIAL_TELEGRAPH') hud.showBanner(ev.name, 42, '#f97316');
          else if (ev.type === 'ROUND_START') hud.showBanner(`ROUND ${ev.round}`, 50);
        }

        // For multi-fight modes (Boss Rush & Endless Waves), only show Results on defeat or final Boss Rush clear
        const hasMoreFights =
          (mode instanceof BossRushMode && st.winner === 0 && !mode.isFullyCleared()) ||
          (mode instanceof WavesMode && st.winner === 0);

        if (st.phase === 'match_end' && hasMoreFights) {
          // Record intermediate Boss Rush / Waves progress without interrupting gameplay with a popup
          const prog = loadProgress();
          if (mode instanceof BossRushMode) {
            saveProgress({
              ...prog,
              bossRushBestStage: Math.max(prog.bossRushBestStage, mode.getCurrentStageNumber()),
            });
            hud.showBanner('NEXT CHALLENGER', 65, '#ffd54f');
          } else if (mode instanceof WavesMode) {
            saveProgress({
              ...prog,
              wavesBestWave: Math.max(prog.wavesBestWave, mode.wave),
              wavesBestScore: Math.max(prog.wavesBestScore, mode.score),
            });
            hud.showBanner(`WAVE ${mode.wave + 1}`, 65, '#ffd54f');
          }
          lastEventFrame = -1;
        } else if (st.phase === 'match_end' && !resultsShown) {
          resultsShown = true;
          setCombatCapture(false);
          const rec = mode.getRecording();
          lastRecording = rec;
          if (rec) ghostStore.save(rec);
          recordMatchStats(st.stats[0], st.winner === 0);

          // Update progression
          const prog = loadProgress();
          if (mode instanceof BossRushMode) {
            saveProgress({
              ...prog,
              bossRushBestStage: Math.max(prog.bossRushBestStage, mode.getCurrentStageNumber()),
              bossRushClears: prog.bossRushClears + (mode.isFullyCleared() ? 1 : 0),
            });
          } else if (mode instanceof WavesMode) {
            saveProgress({
              ...prog,
              wavesBestWave: Math.max(prog.wavesBestWave, mode.wave),
              wavesBestScore: Math.max(prog.wavesBestScore, mode.score),
            });
          } else if (lastAction.type === 'DAILY_CHALLENGE' && st.winner === 0) {
            const daily = { dateKey: lastAction.dateKey };
            const score = st.stats[0].damageDealt * 10 + st.stats[0].parries * 250 + st.fighters[0].hp * 20;
            const prev = prog.dailyBestScores[daily.dateKey] ?? 0;
            saveProgress({
              ...prog,
              dailyBestScores: { ...prog.dailyBestScores, [daily.dateKey]: Math.max(prev, score) },
            });
          }

          const durationSec = Math.max(0, Math.round((performance.now() - matchStartMs) / 1000));
          trackMatchEnded({
            actionType: lastAction.type,
            modeId: mode.id,
            stageId: st.config.stageId,
            p1Char: st.config.p1Char,
            p2Char: st.config.p2Char,
            won: st.winner === 0,
            durationSec,
            parries: st.stats[0].parries,
            perfectDodges: st.stats[0].perfectDodges,
            bossRushStage: mode instanceof BossRushMode ? mode.getCurrentStageNumber() : undefined,
            bossRushCleared: mode instanceof BossRushMode ? mode.isFullyCleared() : undefined,
            wavesReached: mode instanceof WavesMode ? mode.wave : undefined,
            wavesScore: mode instanceof WavesMode ? mode.score : undefined,
          });

          resultsView.show(st, mode.title, rec !== null);
        }
      }

      const alpha = frameStep.enabled ? 1 : accumulator / STEP_MS;
      const curr = mode.getState();
      const prev = mode.getPrevState();
      renderer.render(prev, curr, alpha, renderOpts);
      hud.update(curr, mode.p2Label);
      hud.setNetInfo(mode.getNetBadge());
      input.touch.updateHudFeedback(curr.fighters[0].specialMeter, curr.fighters[0].counterWindow > 0);

      const subText = mode.getSubStatus();
      if (subText) {
        subStatusEl.style.display = 'block';
        subStatusEl.textContent = navigator.maxTouchPoints > 0 && mode.id === 'training' ? 'Training · Try moves freely · Pause for settings' : subText;
      } else {
        subStatusEl.style.display = 'none';
      }

      debugOverlay.update(
        curr,
        renderer.getDebugGraphics(),
        lastSimMs,
        renderer.getDrawLayerCount(),
        frameStep.enabled,
      );
    } else if (!mode) {
      // Live idle menu background
      menuDemoState = step(menuDemoState, [0, 0]);
      renderer.render(menuDemoState, menuDemoState, 1, renderOpts);
    }

    requestAnimationFrame(loop);
  };

  // Auto-join invite link (?room=ABC123) if present in URL
  const inviteRoom = getInviteRoomFromUrl();
  if (inviteRoom) {
    handleMenuAction({ type: 'JOIN_ROOM', code: inviteRoom });
  }

  requestAnimationFrame(loop);
}

void bootstrap();
