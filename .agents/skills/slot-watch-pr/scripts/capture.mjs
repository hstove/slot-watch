#!/usr/bin/env node
// Capture a screenshot (PNG) or short screen recording (GIF) of a Slot Watch page
// for a pull request description.
//
// playwright-core is installed on first run into ~/.cache/slot-watch-pr (not the repo),
// so the project gains no dependency:
//
//   node .agents/skills/slot-watch-pr/scripts/capture.mjs \
//     --url https://slotwatch.dev/signers --out tmp/pr-assets/before-signers.png
//
// Options:
//   --url <url>          Page to capture (required)
//   --out <path>         Output file: .png for a screenshot, .gif for a recording (required)
//   --wait <ms>          Wait after page load before capturing (default 5000)
//   --width <px>         Viewport width (default 1440)
//   --height <px>        Viewport height (default 900)
//   --full-page          Capture the whole scrollable page (screenshots only)
//   --selector <css>     Screenshot only this element (screenshots only)
//   --click <css>        Click this element before capturing (repeatable, in order)
//   --theme <dark|light> Color scheme to emulate (default dark)
//   --duration <ms>      Recording length for .gif output (default 8000)
//   --fps <n>            GIF frame rate (default 10)
//
// Browser: uses $CHROME_PATH, then google-chrome / chromium on PATH. GIF output needs ffmpeg.
// Local dev URLs (https://slotwatch.localhost) use a self-signed cert, so HTTPS errors are ignored.

import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const loadPlaywright = async () => {
  const cacheDir = join(homedir(), '.cache', 'slot-watch-pr');
  const manifest = join(cacheDir, 'package.json');
  if (!existsSync(join(cacheDir, 'node_modules', 'playwright-core'))) {
    console.error(`Installing playwright-core into ${cacheDir} ...`);
    mkdirSync(cacheDir, { recursive: true });
    if (!existsSync(manifest)) {
      writeFileSync(
        manifest,
        '{ "name": "slot-watch-pr-capture", "private": true }\n'
      );
    }
    execFileSync('bun', ['add', 'playwright-core@1'], {
      cwd: cacheDir,
      stdio: 'inherit',
    });
  }
  const entry = createRequire(manifest).resolve('playwright-core');
  return (await import(pathToFileURL(entry).href)).default;
};

const { values: args } = parseArgs({
  options: {
    url: { type: 'string' },
    out: { type: 'string' },
    wait: { type: 'string', default: '5000' },
    width: { type: 'string', default: '1440' },
    height: { type: 'string', default: '900' },
    'full-page': { type: 'boolean', default: false },
    selector: { type: 'string' },
    click: { type: 'string', multiple: true, default: [] },
    theme: { type: 'string', default: 'dark' },
    duration: { type: 'string', default: '8000' },
    fps: { type: 'string', default: '10' },
  },
});

if (!(args.url && args.out)) {
  console.error(
    'Usage: capture.mjs --url <url> --out <file.png|file.gif> [options]'
  );
  process.exit(1);
}

const findChrome = () => {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  for (const bin of [
    'google-chrome',
    'google-chrome-stable',
    'chromium',
    'chromium-browser',
  ]) {
    try {
      return execFileSync('which', [bin], { encoding: 'utf8' }).trim();
    } catch {
      // try the next candidate
    }
  }
  const mac = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (existsSync(mac)) return mac;
  throw new Error('No Chrome/Chromium found. Set CHROME_PATH.');
};

const out = resolve(args.out);
const ext = extname(out).toLowerCase();
if (ext !== '.png' && ext !== '.gif') {
  throw new Error(`--out must end in .png or .gif, got ${ext}`);
}
mkdirSync(dirname(out), { recursive: true });

const viewport = { width: Number(args.width), height: Number(args.height) };
const isRecording = ext === '.gif';

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: findChrome() });
const framesDir = isRecording
  ? mkdtempSync(join(tmpdir(), 'slot-watch-capture-'))
  : undefined;
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: isRecording ? 1 : 2,
    colorScheme: args.theme === 'light' ? 'light' : 'dark',
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  // SSE connections keep the network busy, so never wait for "networkidle".
  await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(Number(args.wait));

  for (const selector of args.click) {
    await page.click(selector);
    await page.waitForTimeout(1000);
  }

  if (framesDir) {
    // Grab frames with screenshots and stitch them with the system ffmpeg. This avoids
    // Playwright's recordVideo, which needs its own separately downloaded ffmpeg build.
    const interval = 1000 / Number(args.fps);
    const started = Date.now();
    let frame = 0;
    while (Date.now() - started < Number(args.duration)) {
      const shotAt = Date.now();
      const name = `frame-${String(frame++).padStart(5, '0')}.png`;
      await page.screenshot({ path: join(framesDir, name) });
      await page.waitForTimeout(Math.max(0, interval - (Date.now() - shotAt)));
    }
    // Screenshots can be slower than the target fps; use the real rate so playback isn't sped up.
    const realFps = (frame / ((Date.now() - started) / 1000)).toFixed(2);
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-loglevel',
        'error',
        '-framerate',
        realFps,
        '-i',
        join(framesDir, 'frame-%05d.png'),
        '-vf',
        `scale=${Math.min(viewport.width, 1200)}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`,
        out,
      ],
      { stdio: 'inherit' }
    );
  } else if (args.selector) {
    await page.locator(args.selector).first().screenshot({ path: out });
  } else {
    await page.screenshot({ path: out, fullPage: args['full-page'] });
  }
  console.log(`Wrote ${out}`);
} finally {
  await browser.close();
  if (framesDir) rmSync(framesDir, { recursive: true, force: true });
}
