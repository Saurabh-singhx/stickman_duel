#!/usr/bin/env node
/**
 * Visual Catalog Capture Script
 *
 * Launches the Animation Lab (?lab=1&hideUi=1) in headless Chromium (SwiftShader WebGL)
 * and renders labeled keyframe contact-sheet PNGs into screenshots/lab/ for every
 * Player Special, Cinematic Finisher, Boss Arena Special, Move, and Character silhouette.
 *
 * Usage:
 *   npm run capture:visuals
 *   node scripts/capture-visuals.mjs --only=specials
 *   node scripts/capture-visuals.mjs --only=finishers --id=tempest_thunder
 *   node scripts/capture-visuals.mjs --only=bosses --boxes
 *   node scripts/capture-visuals.mjs --url=http://127.0.0.1:5173
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
function getArg(name) {
  const prefix = `--${name}=`;
  const found = args.find((a) => a.startsWith(prefix));
  return found ? found.slice(prefix.length) : null;
}
const hasFlag = (name) => args.includes(`--${name}`);

const onlyFilter = (getArg('only') ?? 'characters,specials,finishers,bosses,moves')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const idFilter = getArg('id');
const showBoxes = hasFlag('boxes');
const externalUrl = getArg('url');
const p1xArg = getArg('p1x');
const p2xArg = getArg('p2x');
const p1XOpt = p1xArg !== null ? Number(p1xArg) : undefined;
const p2XOpt = p2xArg !== null ? Number(p2xArg) : undefined;
const outRoot = path.resolve(getArg('out') ?? 'screenshots/lab');

const PORT = 4179;
const BASE_URL = externalUrl ?? `http://127.0.0.1:${PORT}`;
const explicitBrowserPath = getArg('browser-path');

async function resolveBrowserExecutable() {
  if (explicitBrowserPath && existsSync(explicitBrowserPath)) {
    return explicitBrowserPath;
  }
  const defaultPath = chromium.executablePath();
  if (defaultPath && existsSync(defaultPath)) {
    return undefined;
  }
  const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH ?? path.join(os.homedir(), '.cache', 'ms-playwright');
  if (existsSync(cacheDir)) {
    const entries = (await fs.readdir(cacheDir)).sort().reverse();
    for (const entry of entries) {
      if (entry.startsWith('chromium_headless_shell-')) {
        for (const sub of ['chrome-headless-shell-linux64/chrome-headless-shell', 'chrome-linux/headless_shell']) {
          const p = path.join(cacheDir, entry, sub);
          if (existsSync(p)) return p;
        }
      }
      if (entry.startsWith('chromium-')) {
        for (const sub of ['chrome-linux64/chrome', 'chrome-linux/chrome']) {
          const p = path.join(cacheDir, entry, sub);
          if (existsSync(p)) return p;
        }
      }
    }
  }
  for (const sys of ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    if (existsSync(sys)) return sys;
  }
  return undefined;
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Timed out waiting for dev server at ${url}`);
}

async function waitFrames(page, count = 2) {
  await page.evaluate(
    (n) =>
      new Promise((resolve) => {
        let i = 0;
        const step = () => {
          i += 1;
          if (i >= n) resolve();
          else requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }),
    count,
  );
}

/**
 * Uses a scratch browser page Canvas 2D context to stitch frame buffers into a
 * single labeled contact-sheet PNG (zero native image dependencies required).
 */
async function buildContactSheet(sheetPage, title, subtitle, panels) {
  const dataUrls = panels.map((p) => ({
    label: p.label,
    src: `data:image/jpeg;base64,${p.buffer.toString('base64')}`,
  }));

  const pngBase64 = await sheetPage.evaluate(
    async ({ sheetTitle, sheetSubtitle, tiles }) => {
      const cols = tiles.length <= 2 ? tiles.length : tiles.length <= 6 ? 2 : 3;
      const rows = Math.ceil(tiles.length / cols);
      const tileW = cols === 3 ? 560 : 640;
      const tileH = cols === 3 ? 315 : 360;
      const headerH = 56;
      const labelH = 26;
      const pad = 12;

      const canvas = document.createElement('canvas');
      canvas.width = pad + cols * (tileW + pad);
      canvas.height = headerH + pad + rows * (tileH + labelH + pad);
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#12110f';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.fillStyle = '#ebc45b';
      ctx.font = 'bold 20px Inter, system-ui, sans-serif';
      ctx.fillText(sheetTitle, pad, 26);

      ctx.fillStyle = '#cfc5b4';
      ctx.font = '13px monospace';
      ctx.fillText(sheetSubtitle, pad, 46);

      const loaded = await Promise.all(
        tiles.map(
          (t) =>
            new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve({ label: t.label, img });
              img.onerror = reject;
              img.src = t.src;
            }),
        ),
      );

      for (let i = 0; i < loaded.length; i += 1) {
        const { label, img } = loaded[i];
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = pad + col * (tileW + pad);
        const y = headerH + pad + row * (tileH + labelH + pad);

        ctx.drawImage(img, x, y, tileW, tileH);
        ctx.strokeStyle = 'rgba(235, 196, 91, 0.45)';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, tileW, tileH);

        ctx.fillStyle = '#1e1c18';
        ctx.fillRect(x, y + tileH, tileW, labelH);
        ctx.fillStyle = '#f5efe4';
        ctx.font = 'bold 13px monospace';
        ctx.fillText(label, x + 8, y + tileH + 17);
      }

      const url = canvas.toDataURL('image/png');
      return url.slice('data:image/png;base64,'.length);
    },
    { sheetTitle: title, sheetSubtitle: subtitle, tiles: dataUrls },
  );

  return Buffer.from(pngBase64, 'base64');
}

async function captureScenarioSheet(page, sheetPage, outPath, req) {
  const fullReq = {
    ...req,
    ...(p1XOpt !== undefined ? { p1X: p1XOpt } : {}),
    ...(p2XOpt !== undefined ? { p2X: p2XOpt } : {}),
  };
  const info = await page.evaluate((r) => window.__DUSKBLADE__.lab.loadScenario(r), fullReq);
  await waitFrames(page, 1);

  const panels = [];
  for (const kf of info.keyFrames) {
    await page.evaluate((f) => window.__DUSKBLADE__.lab.seekFrame(f), kf.frame);
    await waitFrames(page, 1);
    const buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
    panels.push({ label: `f${kf.frame} · ${kf.label}`, buffer });
  }

  const sheet = await buildContactSheet(sheetPage, info.label, info.subtitle, panels);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, sheet);
  console.log(`saved ${path.relative(process.cwd(), outPath)} (${panels.length} frames)`);
}

async function main() {
  let serverProc = null;
  if (!externalUrl) {
    serverProc = spawn('npx', ['vite', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], {
      stdio: 'ignore',
      detached: false,
    });
    await waitForServer(`${BASE_URL}/`);
  }

  const executablePath = await resolveBrowserExecutable();
  const browser = await chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-webgl',
      '--ignore-gpu-blocklist',
    ],
  });

  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    const sheetPage = await context.newPage();

    await page.goto(`${BASE_URL}/?lab=1&hideUi=1`, { waitUntil: 'networkidle' });
    await page.waitForFunction(() => Boolean(window.__DUSKBLADE__?.lab));
    if (showBoxes) {
      await page.evaluate(() => window.__DUSKBLADE__.lab.setHitboxesVisible(true));
    }

    const catalog = await page.evaluate(() => window.__DUSKBLADE__.lab.getCatalog());
    const includes = (key) => onlyFilter.includes('all') || onlyFilter.includes(key);
    const matchesId = (id) => !idFilter || id.includes(idFilter);

    if (includes('characters')) {
      const panels = [];
      for (const ch of catalog.characters) {
        if (!matchesId(ch.id)) continue;
        await page.evaluate(
          (charId) => {
            window.__DUSKBLADE__.lab.loadScenario({
              category: 'state',
              id: 'character_showcase',
              p1Char: charId,
              p2Char: charId === 'warden' ? 'hero' : 'warden',
              stageId: 'beige_plain',
            });
            window.__DUSKBLADE__.lab.seekFrame(12);
          },
          ch.id,
        );
        await waitFrames(page, 1);
        const buffer = await page.screenshot({ type: 'jpeg', quality: 92 });
        panels.push({ label: `${ch.name} (${ch.id}) — ${ch.title}`, buffer });
      }
      if (panels.length > 0) {
        const sheet = await buildContactSheet(
          sheetPage,
          'Character Roster & Weapons (P1 slot)',
          'All 7 playable/boss stickman silhouettes, capes, hoods, masks, and weapons',
          panels,
        );
        const outPath = path.join(outRoot, 'characters', 'roster.png');
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, sheet);
        console.log(`saved ${path.relative(process.cwd(), outPath)} (${panels.length} characters)`);
      }
    }

    if (includes('specials')) {
      for (const sp of catalog.playerSpecials) {
        if (!matchesId(sp.id)) continue;
        await captureScenarioSheet(page, sheetPage, path.join(outRoot, 'specials', `${sp.id}.png`), {
          category: 'player_special',
          id: sp.id,
          p1Char: 'hero',
          p2Char: 'warden',
          stageId: 'beige_plain',
        });
      }
    }

    if (includes('finishers')) {
      for (const fin of catalog.finishers) {
        if (!matchesId(fin.id)) continue;
        await captureScenarioSheet(page, sheetPage, path.join(outRoot, 'finishers', `${fin.id}.png`), {
          category: 'finisher',
          id: fin.id,
          p1Char: 'hero',
          p2Char: 'warden',
          stageId: fin.id === 'tempest_thunder' ? 'dusk_desert' : 'beige_plain',
        });
      }
    }

    if (includes('bosses')) {
      for (const bs of catalog.bossSpecials) {
        if (!matchesId(bs.id) && !(bs.ownerChar && matchesId(bs.ownerChar))) continue;
        await captureScenarioSheet(
          page,
          sheetPage,
          path.join(outRoot, 'bosses', `${bs.ownerChar ?? 'boss'}__${bs.id}.png`),
          {
            category: 'boss_special',
            id: bs.id,
            p1Char: 'hero',
            p2Char: bs.ownerChar ?? 'warden',
            stageId: 'ruined_hall',
            hitTarget: true,
          },
        );
      }
    }

    if (includes('moves')) {
      for (const mv of catalog.moves) {
        if (!matchesId(mv.id)) continue;
        await captureScenarioSheet(page, sheetPage, path.join(outRoot, 'moves', `${mv.id}.png`), {
          category: 'move',
          id: mv.id,
          p1Char: 'hero',
          p2Char: 'swordsman',
          stageId: 'beige_plain',
          hitTarget: true,
        });
      }
    }

    if (includes('states')) {
      for (const st of catalog.states) {
        if (!matchesId(st.id)) continue;
        await captureScenarioSheet(page, sheetPage, path.join(outRoot, 'states', `${st.id}.png`), {
          category: 'state',
          id: st.id,
          p1Char: 'hero',
          p2Char: 'warden',
          stageId: st.id === 'slab_hazard' ? 'ruined_hall' : 'beige_plain',
        });
      }
    }
  } finally {
    await browser.close();
    if (serverProc) {
      serverProc.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
