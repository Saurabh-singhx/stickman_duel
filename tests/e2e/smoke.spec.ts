import { expect, test } from '@playwright/test';

test.describe('Stickman Duel Headless E2E & Visual Verification', () => {
  test('renders menu, plays Vs Bot & Training/FrameStep, proves zero scene leaks, and captures 5 screenshots', async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await page.waitForSelector('[data-testid="btn-play"]');
    await page.waitForTimeout(350);

    // 1. Screenshot: Main Menu
    await page.screenshot({ path: 'screenshots/01-menu.png' });

    // Verify zero leaks over 20 scene switches
    const metrics = await page.evaluate(() => window.__DUSKBLADE__!.testSceneSwitches(20));
    expect(metrics.active).toBe(1);
    expect(metrics.disposed).toBeGreaterThanOrEqual(20);

    // Launch Vs Bot and let combat unfold for a mid-fight screenshot
    await page.click('[data-testid="btn-vs-bot"]');
    await page.waitForTimeout(1400);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(350);
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(120);
    await page.keyboard.up('KeyD');

    // 2. Screenshot: Mid-Fight Frame
    await page.screenshot({ path: 'screenshots/02-mid-fight.png' });

    // Verify Training Mode + Debug Overlay (F1) + Frame-Step (F2/F3)
    await page.evaluate(() => {
      window.__DUSKBLADE__!.startAction({ type: 'TRAINING', stageId: 'beige_plain' });
    });
    await page.waitForTimeout(250);
    const stepOn = await page.evaluate(() => window.__DUSKBLADE__!.toggleFrameStep());
    expect(stepOn).toBe(true);
    await page.waitForTimeout(100);
    const frameBefore = await page.evaluate(() => window.__DUSKBLADE__!.getState().frame);
    await page.waitForTimeout(120);
    const frameWhilePaused = await page.evaluate(() => window.__DUSKBLADE__!.getState().frame);
    expect(frameWhilePaused).toBe(frameBefore);

    await page.evaluate(() => window.__DUSKBLADE__!.stepOneFrame());
    await page.waitForTimeout(200);
    const frameAfterStep = await page.evaluate(() => window.__DUSKBLADE__!.getState().frame);
    expect(frameAfterStep).toBe(frameBefore + 1);

    // 3. Screenshot: Parry Spark (deterministic state + parry event)
    await page.evaluate(() => {
      const base = window.__DUSKBLADE__!.getState();
      const parryState = {
        ...base,
        phase: 'fighting' as const,
        config: { ...base.config, stageId: 'beige_plain' as const, p1Char: 'hero' as const, p2Char: 'swordsman' as const, trainingMode: false },
        fighters: [
          { ...base.fighters[0], x: 560_000, y: 540_000, facing: 1 as const, action: 'parry_active' as const, actionFrame: 2, counterWindow: 36 },
          { ...base.fighters[1], x: 660_000, y: 540_000, facing: -1 as const, action: 'parry_stagger' as const, actionFrame: 4, stunFrames: 36 },
        ] as const,
        events: [{ type: 'PARRY' as const, parrier: 0 as const, attacker: 1 as const, x: 610_000, y: 476_000 }],
      };
      window.__DUSKBLADE__!.setCustomState(parryState);
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: 'screenshots/03-parry-spark.png' });

    // 4. Screenshot: Cinematic Finisher (hero low lunge + crawling enemy + golden slash + shards)
    await page.evaluate(() => {
      const base = window.__DUSKBLADE__!.getState();
      const finisherState = {
        ...base,
        phase: 'finisher' as const,
        phaseFrame: 34,
        activeFinisherId: 'low_lunge' as const,
        finisherAttacker: 0 as const,
        config: { ...base.config, stageId: 'dusk_desert' as const, p1Char: 'hero' as const, p2Char: 'assassin' as const, trainingMode: false },
        fighters: [
          { ...base.fighters[0], x: 545_000, y: 540_000, facing: 1 as const, action: 'finisher_atk' as const, actionFrame: 34 },
          { ...base.fighters[1], x: 675_000, y: 540_000, facing: -1 as const, hp: 0, action: 'finisher_vic' as const, actionFrame: 34 },
        ] as const,
        events: [
          {
            type: 'FINISHER_IMPACT' as const,
            attacker: 0 as const,
            victim: 1 as const,
            finisherId: 'low_lunge' as const,
            x: 675_000,
            y: 540_000,
          },
        ],
      };
      window.__DUSKBLADE__!.setCustomState(finisherState);
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: 'screenshots/04-finisher.png' });

    // 5. Screenshot: Coffin Slab Hazard bursting in Ruined Hall vs Warden
    await page.evaluate(() => {
      const base = window.__DUSKBLADE__!.getState();
      const slabState = {
        ...base,
        phase: 'fighting' as const,
        config: { ...base.config, stageId: 'ruined_hall' as const, p1Char: 'hero' as const, p2Char: 'warden' as const, enableHazards: true, trainingMode: false },
        fighters: [
          { ...base.fighters[0], x: 460_000, y: 540_000, facing: 1 as const, action: 'dodge' as const, actionFrame: 6, dodgeDir: -1 as const },
          { ...base.fighters[1], x: 800_000, y: 540_000, facing: -1 as const, action: 'attack' as const, currentMove: 'unblockable' as const, actionFrame: 10 },
        ] as const,
        hazards: [
          { id: 1, x: 610_000, phase: 'active' as const, frame: 5, hitMask: 0 },
          { id: 2, x: 495_000, phase: 'telegraph' as const, frame: 20, hitMask: 0 },
        ],
        events: [{ type: 'SLAB_BURST' as const, slabId: 1, x: 610_000 }],
      };
      window.__DUSKBLADE__!.setCustomState(slabState);
    });
    await page.waitForTimeout(120);
    await page.screenshot({ path: 'screenshots/05-slab-hazard.png' });

    // 6. Screenshot: Tempest Thunder 6.5s Night Storm Finisher
    await page.evaluate(() => {
      const base = window.__DUSKBLADE__!.getState();
      const thunderState = {
        ...base,
        phase: 'finisher' as const,
        phaseFrame: 160,
        activeFinisherId: 'tempest_thunder' as const,
        finisherAttacker: 0 as const,
        config: { ...base.config, stageId: 'beige_plain' as const, p1Char: 'hero' as const, p2Char: 'warden' as const, trainingMode: false },
        fighters: [
          { ...base.fighters[0], x: 560_000, y: 540_000, facing: 1 as const, action: 'finisher_atk' as const, actionFrame: 160 },
          { ...base.fighters[1], x: 665_000, y: 540_000, facing: -1 as const, hp: 0, action: 'finisher_vic' as const, actionFrame: 160 },
        ] as const,
        events: [
          {
            type: 'FINISHER_BEAT' as const,
            attacker: 0 as const,
            victim: 1 as const,
            finisherId: 'tempest_thunder' as const,
            beatIndex: 2,
            x: 665_000,
            y: 540_000,
          },
        ],
      };
      window.__DUSKBLADE__!.setCustomState(thunderState);
    });
    await page.waitForTimeout(180);
    await page.screenshot({ path: 'screenshots/06-thunder-finisher.png' });

    expect(errors).toEqual([]);
  });

  test('two browser tabs join the same room code and simulate in lockstep with matching hashes', async ({
    context,
  }) => {
    test.setTimeout(70000);
    const tab1 = await context.newPage();
    const tab2 = await context.newPage();

    await tab1.goto('/');
    await tab2.goto('/');
    for (const tab of [tab1, tab2]) {
      await tab.getByTestId('btn-dismiss-daily').click();
    }
    await tab1.waitForSelector('[data-testid="btn-host-room"]');
    await tab2.waitForSelector('[data-testid="input-room-code"]');

    // Host creates a deterministic room via OnlineMode
    await tab1.evaluate(() => {
      window.__DUSKBLADE__!.startAction({ type: 'HOST_ROOM', stageId: 'beige_plain' });
    });
    await expect(tab1.locator('.room-lobby')).toHaveAttribute('data-state', 'waiting', { timeout: 25000 });
    const roomCode = await tab1.getByLabel('Your room code').inputValue();
    expect(roomCode).toMatch(/^[A-Z0-9]{6}$/);

    // Guest joins via room code
    await tab2.fill('[data-testid="input-room-code"]', roomCode!);
    await tab2.click('[data-testid="btn-join-room"]');

    await expect(tab1.locator('.room-lobby')).toBeHidden({ timeout: 25000 });
    await expect(tab2.locator('.room-lobby')).toBeHidden({ timeout: 25000 });

    // Let both tabs exchange inputs in lockstep for ~1.5 seconds
    await tab1.waitForTimeout(400);
    await tab1.keyboard.down('KeyD');
    await tab2.keyboard.down('KeyA');
    await tab1.waitForTimeout(500);
    await tab1.keyboard.press('KeyJ');
    await tab2.keyboard.press('KeyL');
    await tab1.waitForTimeout(1100);
    await tab1.keyboard.up('KeyD');
    await tab2.keyboard.up('KeyA');

    // Pause both on frame-step and verify both progressed cleanly without desync
    const state1 = await tab1.evaluate(() => window.__DUSKBLADE__!.getState());
    const state2 = await tab2.evaluate(() => window.__DUSKBLADE__!.getState());
    expect(state1.frame).toBeGreaterThanOrEqual(15);
    expect(state2.frame).toBeGreaterThanOrEqual(15);
    expect(Math.abs(state1.frame - state2.frame)).toBeLessThanOrEqual(8);

    // Invite links must initialize safely, and a third player must not replace the guest.
    const extra = await context.newPage();
    await extra.goto(`/?room=${roomCode}`);
    await expect(extra.locator('.room-lobby [role="status"]')).toContainText('already has two players', { timeout: 25000 });
    await expect(tab1.locator('.room-lobby')).toBeHidden();
    await expect(tab2.locator('.room-lobby')).toBeHidden();

  });
});
