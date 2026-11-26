import { Application, Container, Graphics } from 'pixi.js';
import { BALANCE } from '../data/balance';
import { CHARACTERS, type CharacterId } from '../data/characters';
import { FINISHERS } from '../data/finishers';
import { STAGES } from '../data/stages';
import { fromFp, lerpFpToPx } from '../sim/Fixed';
import type { GameState, SimEvent } from '../sim/State';
import { CameraFx } from './CameraFx';
import { CrackPool } from './Cracks';
import { DustPool } from './Dust';
import { FighterView } from './FighterView';
import { FinisherFx } from './FinisherFx';
import { SpecialFx } from './SpecialFx';
import { ParticlePool } from './Particles';
import { ShardPool } from './Shards';
import { SlashPool } from './Slash';
import { StageView } from './Stage';

/** Visual rendering preferences read from Settings. */
export interface RenderOptions {
  readonly screenShake: boolean;
  readonly glowEnabled: boolean;
  readonly reduceFlashing: boolean;
  readonly colorblindTelegraph: boolean;
  readonly quality: 'low' | 'high';
}

/**
 * Main PixiJS v8 renderer with WebGL/Canvas fallback, state interpolation,
 * pooled FX systems, and explicit scene lifecycle disposal tracking.
 */
export class Renderer {
  public readonly app: Application;
  public readonly camera = new CameraFx();
  public activeSceneContainers = 0;
  public totalDisposedScenes = 0;

  private worldContainer: Container | null = null;
  private stageGfx: Graphics | null = null;
  private stormBackGfx: Graphics | null = null;
  private cracksGfx: Graphics | null = null;
  private hazardsGfx: Graphics | null = null;
  private fightersGfx: Graphics | null = null;
  private fxGfx: Graphics | null = null;
  private debugGfx: Graphics | null = null;
  private flashGfx: Graphics | null = null;

  private readonly stageView = new StageView();
  private fighterViews: [FighterView, FighterView] = [
    new FighterView('hero'),
    new FighterView('swordsman'),
  ];
  private readonly slashes = new SlashPool(24);
  private readonly particles = new ParticlePool(140, 16);
  private readonly shards = new ShardPool(80);
  private readonly dust = new DustPool(72);
  private readonly cracks = new CrackPool(16);
  private readonly finisherFx = new FinisherFx();
  private readonly specialFx = new SpecialFx();

  private p1Char: CharacterId = 'hero';
  private p2Char: CharacterId = 'swordsman';
  private initialized = false;

  constructor() {
    this.app = new Application();
  }

  /** Initializes PixiJS Application with capped pixel ratio (max 2). */
  public async init(host: HTMLElement): Promise<void> {
    if (this.initialized) return;
    await this.app.init({
      resizeTo: host,
      antialias: true,
      backgroundColor: 0x141311,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      preference: 'webgl',
    });
    host.appendChild(this.app.canvas);
    this.initialized = true;
    this.mountScene('hero', 'swordsman');
  }

  /**
   * Disposes any prior scene container cleanly and mounts a fresh fight scene.
   * Tracks container counts to prove zero memory leaks across scene switches.
   */
  public mountScene(p1Char: CharacterId, p2Char: CharacterId): void {
    this.disposeScene();
    this.p1Char = p1Char;
    this.p2Char = p2Char;
    this.fighterViews = [new FighterView(p1Char), new FighterView(p2Char)];

    this.worldContainer = new Container();
    this.stageGfx = new Graphics();
    this.stormBackGfx = new Graphics();
    this.cracksGfx = new Graphics();
    this.hazardsGfx = new Graphics();
    this.fightersGfx = new Graphics();
    this.fxGfx = new Graphics();
    this.debugGfx = new Graphics();
    this.flashGfx = new Graphics();

    this.worldContainer.addChild(
      this.stageGfx,
      this.stormBackGfx,
      this.cracksGfx,
      this.hazardsGfx,
      this.fightersGfx,
      this.fxGfx,
      this.debugGfx,
    );
    this.app.stage.addChild(this.worldContainer, this.flashGfx);
    this.activeSceneContainers += 1;

    this.slashes.clear();
    this.particles.clear();
    this.shards.clear();
    this.dust.clear();
    this.cracks.clear();
    this.finisherFx.clear();
    this.camera.reset();
  }

  /** Cleanly destroys the active scene container and all child Graphics objects. */
  public disposeScene(): void {
    if (this.worldContainer) {
      this.app.stage.removeChild(this.worldContainer);
      this.worldContainer.destroy({ children: true });
      this.worldContainer = null;
      this.activeSceneContainers = Math.max(0, this.activeSceneContainers - 1);
      this.totalDisposedScenes += 1;
    }
    if (this.flashGfx) {
      this.app.stage.removeChild(this.flashGfx);
      this.flashGfx.destroy();
      this.flashGfx = null;
    }
    this.stageGfx = null;
    this.stormBackGfx = null;
    this.cracksGfx = null;
    this.hazardsGfx = null;
    this.fightersGfx = null;
    this.fxGfx = null;
    this.debugGfx = null;
  }

  /** Processes typed simulation events into visual effects, camera shake, and flashes. */
  public handleEvents(events: readonly SimEvent[], state: GameState, opts: RenderOptions): void {
    const floorY = BALANCE.FLOOR_Y_PX;
    for (const ev of events) {
      switch (ev.type) {
        case 'ROUND_START': {
          this.fighterViews[0].reset(fromFp(state.fighters[0].x), floorY, 1);
          this.fighterViews[1].reset(fromFp(state.fighters[1].x), floorY, -1);
          this.cracks.clear();
    this.finisherFx.clear();
          break;
        }
        case 'ATTACK_START': {
          const char = CHARACTERS[state.fighters[ev.slot].charId];
          const sx = fromFp(ev.x) + ev.facing * 26;
          const sy = fromFp(ev.y) - 66;
          if (ev.move === 'heavy') {
            // Blazing double-layered heavy crescent + floor dust + subtle punch-in shake
            this.slashes.spawn(sx, sy, ev.facing, 114, 30, -1.75, 1.15, 0xffb703, 18);
            this.slashes.spawn(sx, sy, ev.facing, 104, 14, -1.65, 1.05, 0xfff8dc, 14);
            this.dust.puff(fromFp(ev.x), floorY, opts.quality === 'low' ? 4 : 8, -ev.facing);
            this.particles.burstSparks(sx + ev.facing * 35, sy - 20, opts.quality === 'low' ? 5 : 12, 0xffd54f, 8, 14);
            this.camera.addShake(0.18, opts.screenShake);
          } else {
            const isBig = ev.move === 'unblockable' || ev.move === 'counter' || ev.move === 'light4';
            const startAng = ev.move === 'light2' ? 1.35 : ev.move === 'light3' ? -2.1 : -1.35;
            const endAng = ev.move === 'light2' ? -1.35 : ev.move === 'light3' ? 0.85 : 0.95;
            this.slashes.spawn(
              sx,
              sy,
              ev.facing,
              isBig ? 100 : 74,
              isBig ? 22 : 13,
              startAng,
              endAng,
              ev.move === 'counter' ? 0xffe478 : ev.move === 'unblockable' ? 0xff3b3b : char.slashColor,
              isBig ? 18 : 14,
            );
          }
          break;
        }
        case 'HIT': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y);
          const count = opts.quality === 'high' ? (ev.isHeavy ? 24 : 12) : 8;
          this.particles.burstSparks(x, y, count, ev.isCounter ? 0xffe87a : 0xffd54f, ev.isHeavy ? 12 : 8);
          if (ev.isHeavy) {
            this.particles.spawnRing(x, y, 86, 0xffd54f, 16);
            this.cracks.spawn(x, floorY, 0.9);
            this.camera.addShake(0.45, opts.screenShake);
          } else {
            this.camera.addShake(0.2, opts.screenShake);
          }
          break;
        }
        case 'BLOCK': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y);
          this.particles.burstSparks(x, y, 10, 0xfff5d6, 7, 12);
          this.camera.addShake(0.14, opts.screenShake);
          break;
        }
        case 'PARRY': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y);
          this.fighterViews[ev.parrier].triggerParry();
          const dir = state.fighters[ev.parrier].facing;
          this.particles.burstSparks(x, y, opts.quality === 'low' ? 12 : 24, 0xfff099, 11, 16);
          this.slashes.spawn(x, y, dir, 48, 9, -1.8, 0.3, 0xfff5d6, 10);
          this.particles.spawnRing(x, y, 58, 0xffe066, 12);
          this.camera.addShake(0.42, opts.screenShake);
          this.camera.triggerFlash(0xfff5cc, 0.18, opts.reduceFlashing);
          break;
        }
        case 'GUARD_BREAK': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y);
          this.particles.spawnRing(x, y, 130, 0xff6b4a, 22);
          this.shards.burst(x, y, 14, 0xffc845, 9);
          this.camera.addShake(0.55, opts.screenShake);
          this.camera.triggerFlash(0xff8066, 0.28, opts.reduceFlashing);
          break;
        }
        case 'DODGE': {
          this.dust.puff(fromFp(ev.x), floorY, 6, -ev.dir);
          break;
        }
        case 'PERFECT_DODGE': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y) - 60;
          this.particles.spawnRing(x, y, 110, 0x93c5fd, 22);
          this.camera.triggerFlash(0xdbeafe, 0.2, opts.reduceFlashing);
          break;
        }
        case 'FINISHER_START': {
          const fSpec = FINISHERS[ev.finisherId];
          if (fSpec.nightStormBackdrop) {
            this.finisherFx.triggerLightning(fromFp(ev.x) - 120, opts.quality === 'low');
          }
          this.camera.triggerFlash(fSpec.slashColor, 0.24, opts.reduceFlashing);
          break;
        }
        case 'FINISHER_BEAT': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y) - 62;
          const fSpec = FINISHERS[ev.finisherId];
          const atk = state.fighters[ev.attacker];
          const low = opts.quality === 'low';
          if (fSpec.theme === 'thunder_storm') {
            this.finisherFx.triggerLightning(x + (ev.beatIndex % 2 === 0 ? -110 : 120), low);
            this.particles.burstSparks(x - atk.facing * 26, y, low ? 10 : 22, 0xfef08a, 10, 22);
            this.particles.spawnRing(x - atk.facing * 26, y, 95, 0x93c5fd, 18);
            this.camera.addShake(0.35, opts.screenShake);
            this.camera.triggerFlash(0xdbeafe, 0.28, opts.reduceFlashing);
          } else if (fSpec.theme === 'judgment' || fSpec.theme === 'flurry') {
            const ang = -1.2 + ev.beatIndex * 0.62;
            this.finisherFx.spawnCutLine(x, y, ang, 155, fSpec.slashColor, 34);
            this.particles.burstSparks(x, y, low ? 6 : 14, fSpec.slashColor, 11, 16);
            this.camera.addShake(0.24, opts.screenShake);
          } else if (fSpec.theme === 'spin' || fSpec.theme === 'deathblow') {
            this.slashes.spawn(x, y, atk.facing, 115, 20, -1.4 + ev.beatIndex * 0.5, 1.2, fSpec.slashColor, 16);
            this.particles.burstSparks(x, y, low ? 8 : 16, fSpec.slashColor, 11, 18);
          }
          break;
        }
        case 'FINISHER_IMPACT': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y) - 56;
          const fSpec = FINISHERS[ev.finisherId];
          const atk = state.fighters[ev.attacker];
          const vicSpec = CHARACTERS[state.fighters[ev.victim].charId];
          const low = opts.quality === 'low';
          if (fSpec.theme === 'thunder_storm') {
            this.finisherFx.triggerLightning(x, low);
            this.finisherFx.spawnCutLine(x, y, -0.18, 290, 0xfef08a, 44);
          } else if (fSpec.theme === 'eclipse') {
            this.finisherFx.spawnCutLine(x, y, 0, 560, 0xfff8dc, 38);
          } else if (fSpec.theme === 'deathblow') {
            this.finisherFx.spawnCutLine(x, y, -0.75, 175, 0xef4444, 34);
            this.finisherFx.spawnCutLine(x, y, 0.75, 175, 0xffd54f, 34);
          } else if (fSpec.theme === 'judgment') {
            for (let k = 0; k < (low ? 3 : 6); k += 1) {
              this.finisherFx.spawnCutLine(x, y, k * 0.55, 190, 0x93c5fd, 34);
            }
          }
          this.slashes.spawn(x, y, atk.facing, 165, 36, -1.65, 1.35, fSpec.slashColor, 28);
          this.particles.burstSparks(x, y, low ? 18 : 44, 0xffe478, 15, 28);
          this.particles.spawnRing(x, y, 195, fSpec.slashColor, 28);
          this.shards.burst(x, y, low ? 10 : 26, vicSpec.capeColor, 11);
          this.dust.puff(x, floorY, low ? 6 : 14, atk.facing);
          this.cracks.spawn(x, floorY, 1.65, 420);
          this.camera.addShake(0.85, opts.screenShake);
          this.camera.triggerFlash(0xfff8dc, 0.5, opts.reduceFlashing);
          break;
        }
        case 'SLAB_BURST': {
          const x = fromFp(ev.x);
          this.shards.burst(x, floorY - 24, 18, 0x454048, 10);
          this.dust.puff(x, floorY, 12, 0, 0x9a9285);
          this.cracks.spawn(x, floorY, 1.35);
          this.camera.addShake(0.42, opts.screenShake);
          break;
        }
        case 'PLAYER_SPECIAL_IMPACT': {
          const x = fromFp(ev.x);
          const y = fromFp(ev.y) - 56;
          const low = opts.quality === 'low';
          this.particles.burstSparks(x, y, low ? 16 : 40, 0xffe066, 14, 26);
          this.particles.spawnRing(x, y, 180, 0xffd54f, 26);
          this.cracks.spawn(x, floorY, 1.55, 380);
          this.dust.puff(x, floorY, low ? 6 : 14, 0);
          this.camera.addShake(0.75, opts.screenShake);
          this.camera.triggerFlash(0xfff8dc, 0.42, opts.reduceFlashing);
          break;
        }
        case 'BOSS_SPECIAL_ACTIVE': {
          const midX = fromFp(Math.trunc((ev.left + ev.right) / 2));
          this.particles.burstSparks(midX, floorY - 50, opts.quality === 'low' ? 8 : 20, 0xf97316, 11, 18);
          this.cracks.spawn(midX, floorY, 1.25);
          this.camera.addShake(0.45, opts.screenShake);
          break;
        }
        case 'LAND': {
          this.dust.puff(fromFp(ev.x), floorY, 4, 0);
          break;
        }
        default:
          break;
      }
    }
  }

  /** Renders an interpolated frame between prevState and currState. */
  public render(
    prevState: GameState,
    currState: GameState,
    alpha: number,
    opts: RenderOptions,
  ): void {
    if (!this.worldContainer || !this.stageGfx || !this.cracksGfx || !this.hazardsGfx || !this.fightersGfx || !this.fxGfx || !this.flashGfx) {
      return;
    }

    if (currState.config.p1Char !== this.p1Char || currState.config.p2Char !== this.p2Char) {
      this.mountScene(currState.config.p1Char, currState.config.p2Char);
      return;
    }

    this.stageView.setStage(currState.config.stageId);

    const p1x = lerpFpToPx(prevState.fighters[0].x, currState.fighters[0].x, alpha);
    let p1y = lerpFpToPx(prevState.fighters[0].y, currState.fighters[0].y, alpha);
    const p2x = lerpFpToPx(prevState.fighters[1].x, currState.fighters[1].x, alpha);
    let p2y = lerpFpToPx(prevState.fighters[1].y, currState.fighters[1].y, alpha);
    if (currState.activeSpecial?.specialId === 'aerial_lasers') {
      const lift = Math.min(1, currState.activeSpecial.frame / 18, (145 - currState.activeSpecial.frame) / 18) * 195;
      if (currState.activeSpecial.attacker === 0) p1y -= lift;
      else p2y -= lift;
    }

    const isFinisher = currState.phase === 'finisher';
    const isSlowMo =
      isFinisher ||
      currState.fighters[0].slowFrames > 0 ||
      currState.fighters[1].slowFrames > 0;
    const forcedZoom =
      isFinisher && currState.activeFinisherId
        ? FINISHERS[currState.activeFinisherId].cameraZoom
        : null;

    this.camera.update(p1x, p2x, p1y, p2y, forcedZoom, isSlowMo);

    // Apply responsive viewport scaling + camera transform
    const viewW = this.app.screen.width;
    const viewH = this.app.screen.height;
    const baseScale = Math.min(viewW / 1280, viewH / 720);
    const finalScale = baseScale * this.camera.zoom;

    this.worldContainer.scale.set(finalScale);
    this.worldContainer.position.set(
      viewW * 0.5 - this.camera.x * finalScale + this.camera.shakeX,
      viewH * 0.52 - this.camera.y * finalScale + this.camera.shakeY,
    );

    const dtScale = this.camera.slowMoFactor;
    const stageSpec = STAGES[currState.config.stageId];

    this.stageGfx.clear();
    this.stageView.drawBackdrop(this.stageGfx, this.camera.x);
    if (this.stormBackGfx) {
      this.stormBackGfx.clear();
      this.finisherFx.drawBackdropOverlay(this.stormBackGfx, currState, opts.quality === 'low', opts.reduceFlashing, dtScale);
      this.specialFx.drawSpecialBackdrop(this.stormBackGfx, currState.activeSpecial, opts.reduceFlashing);
    }

    this.cracksGfx.clear();
    this.cracks.updateAndDraw(this.cracksGfx, stageSpec.floorLineColor, dtScale);

    this.hazardsGfx.clear();
    this.stageView.drawHazards(this.hazardsGfx, currState.hazards, opts.colorblindTelegraph);
    this.specialFx.drawBossSpecials(this.hazardsGfx, currState.bossSpecials, opts.colorblindTelegraph, opts.quality === 'low');

    this.fightersGfx.clear();
    this.fighterViews[0].draw(
      this.fightersGfx,
      currState.fighters[0],
      p1x,
      p1y,
      opts.glowEnabled,
      opts.colorblindTelegraph,
      dtScale,
    );
    this.fighterViews[1].draw(
      this.fightersGfx,
      currState.fighters[1],
      p2x,
      p2y,
      opts.glowEnabled,
      opts.colorblindTelegraph,
      dtScale,
    );

    this.fxGfx.clear();
    this.dust.updateAndDraw(this.fxGfx, dtScale);
    this.shards.updateAndDraw(this.fxGfx, BALANCE.FLOOR_Y_PX, dtScale);
    this.slashes.updateAndDraw(this.fxGfx, dtScale);
    this.particles.updateAndDraw(this.fxGfx, dtScale);
    this.finisherFx.drawChoreography(this.fxGfx, currState, opts.quality === 'low');
    this.finisherFx.drawForegroundFx(this.fxGfx, dtScale);
    this.specialFx.drawPlayerSpecialForeground(this.fxGfx, currState, opts.quality === 'low');
    this.debugGfx?.clear();

    this.flashGfx.clear();
    if (this.camera.flashAlpha > 0.01) {
      this.flashGfx.rect(0, 0, viewW, viewH).fill({
        color: this.camera.flashColor,
        alpha: this.camera.flashAlpha,
      });
    }
  }

  /** Returns approximate active Graphics layers for debug overlay telemetry. */
  /** Returns the world-space debug Graphics layer for hitbox visualization. */
  public getDebugGraphics(): Graphics | null {
    return this.debugGfx;
  }

  public getDrawLayerCount(): number {
    return this.worldContainer ? this.worldContainer.children.length + 1 : 0;
  }

  /** Destroys the Pixi Application completely. */
  public destroy(): void {
    this.disposeScene();
    if (this.initialized) {
      this.app.destroy(true);
      this.initialized = false;
    }
  }
}
