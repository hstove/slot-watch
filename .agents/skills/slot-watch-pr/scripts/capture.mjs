#!/usr/bin/env node
// Capture a screenshot (PNG) or screen recording (WebM/GIF) of a Slot Watch page
// for a pull request description.
//
// playwright-core (and, for recordings, Playwright's ffmpeg build) are installed on first
// run into ~/.cache (not the repo), so the project gains no dependency:
//
//   node .agents/skills/slot-watch-pr/scripts/capture.mjs \
//     --url https://slotwatch.localhost/signers --out tmp/pr-assets/after-signers.png
//
// Options:
//   --url <url>          Page to capture (required)
//   --out <path>         .png = screenshot, .webm = recording, .gif = recording + a .webm next to it
//   --wait <ms>          Wait after page load before capturing (default 5000)
//   --width <px>         Viewport width (default 1440)
//   --height <px>        Viewport height (default 900)
//   --full-page          Capture the whole scrollable page (screenshots only)
//   --selector <css>     Screenshot only this element (screenshots only)
//   --click <css>        Click this element (repeatable, in order). Clicks happen before a
//                        screenshot, or during a recording so the interaction is visible.
//   --theme <dark|light> Color scheme to emulate (default dark)
//   --duration <ms>      Recording length after the clicks (default 8000)
//
// Recordings use Playwright's built-in video capture. Trimming off the page load and GIF
// conversion use the system ffmpeg; without it you get the untrimmed .webm only.
// Browser: $CHROME_PATH, then google-chrome / chromium on PATH, then macOS Chrome.

import { execFileSync, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

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
  },
});

if (!(args.url && args.out)) {
  console.error(
    'Usage: capture.mjs --url <url> --out <file.png|file.webm|file.gif> [options]'
  );
  process.exit(1);
}

const out = resolve(args.out);
const ext = extname(out).toLowerCase();
if (!['.png', '.webm', '.gif'].includes(ext)) {
  throw new Error(`--out must end in .png, .webm or .gif, got ${ext}`);
}
const isRecording = ext !== '.png';
mkdirSync(dirname(out), { recursive: true });

const run = (cmd, cmdArgs, opts = {}) =>
  execFileSync(cmd, cmdArgs, { stdio: 'inherit', ...opts });

const hasCommand = (cmd) => {
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
};

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
    run('bun', ['add', 'playwright-core@1'], { cwd: cacheDir });
  }
  const entry = createRequire(manifest).resolve('playwright-core');
  if (isRecording) {
    // Video capture needs Playwright's own ffmpeg build. No-op when already installed.
    const cli = join(dirname(entry), 'cli.js');
    run(process.execPath, [cli, 'install', 'ffmpeg'], {
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  }
  return (await import(pathToFileURL(entry).href)).default;
};

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

// Playwright's WebM has no duration header, so decode it to find the length.
const videoDuration = (file) => {
  const { stderr } = spawnSync(
    'ffmpeg',
    ['-hide_banner', '-i', file, '-f', 'null', '-'],
    { encoding: 'utf8' }
  );
  const times = [...stderr.matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
  const [, h, m, sec] = times.at(-1) ?? [0, '0', '0', '0'];
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
};

const viewport = { width: Number(args.width), height: Number(args.height) };
const videoDir = isRecording
  ? mkdtempSync(join(tmpdir(), 'slot-watch-capture-'))
  : undefined;

const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ executablePath: findChrome() });
try {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: isRecording ? 1 : 2,
    colorScheme: args.theme === 'light' ? 'light' : 'dark',
    ignoreHTTPSErrors: true,
    ...(videoDir ? { recordVideo: { dir: videoDir, size: viewport } } : {}),
  });
  const page = await context.newPage();
  // SSE connections keep the network busy, so never wait for "networkidle".
  await page.goto(args.url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(Number(args.wait));
  const recordFrom = Date.now();

  for (const selector of args.click) {
    await page.click(selector);
    await page.waitForTimeout(1000);
  }

  if (isRecording) {
    await page.waitForTimeout(Number(args.duration));
    const video = page.video();
    const keepSeconds = (Date.now() - recordFrom) / 1000;
    await context.close(); // finalizes the video file
    const raw = await video.path();
    const webm = ext === '.webm' ? out : out.replace(/\.gif$/i, '.webm');

    if (hasCommand('ffmpeg')) {
      // Drop the page-load portion so the recording starts on the interesting part. The
      // video's clock doesn't line up with ours at the start, but it does at the end
      // (it ends when the context closes), so keep the last `keepSeconds`.
      const trimSeconds = Math.max(
        0,
        videoDuration(raw) - keepSeconds - 0.3
      ).toFixed(2);
      run('ffmpeg', [
        '-y',
        '-loglevel',
        'error',
        '-ss',
        trimSeconds,
        '-i',
        raw,
        '-c:v',
        'libvpx-vp9',
        '-b:v',
        '0',
        '-crf',
        '36',
        '-row-mt',
        '1',
        webm,
      ]);
      if (ext === '.gif') {
        const scale = Math.min(viewport.width, 1200);
        run('ffmpeg', [
          '-y',
          '-loglevel',
          'error',
          '-i',
          webm,
          '-vf',
          `fps=10,scale=${scale}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5`,
          out,
        ]);
      }
    } else {
      if (ext === '.gif') {
        console.error('ffmpeg not found: wrote the .webm only, no GIF.');
      }
      renameSync(raw, webm);
    }
    console.log(`Wrote ${webm}`);
    if (ext === '.gif' && existsSync(out)) console.log(`Wrote ${out}`);
  } else {
    if (args.selector) {
      await page.locator(args.selector).first().screenshot({ path: out });
    } else {
      await page.screenshot({ path: out, fullPage: args['full-page'] });
    }
    console.log(`Wrote ${out}`);
  }
} finally {
  await browser.close();
  if (videoDir) rmSync(videoDir, { recursive: true, force: true });
}
