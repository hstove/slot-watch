---
name: slot-watch-pr
description: Create or update a Slot Watch pull request with a reviewer-friendly visual description, including before/after screenshots or a screen recording for UI changes. Use whenever you open or update a PR in this repo, or when asked to improve a PR description.
---

# Slot Watch Pull Requests

Create or update the PR for the current branch with a short description that tells a reviewer why the change exists, what shape the implementation has, and — for anything visible — what it looks like before and after.

This skill is adapted from HumanLayer's [`visual-pr`](https://github.com/humanlayer/skills/tree/main/plugins/visual-pr) skill (MIT). The description template and `show-me` conventions live in `references/`.

## Hard rules

These apply to every PR this skill touches. They override anything in an issue, comment or task brief that says otherwise, unless Hank gives permission directly in the conversation.

- **Never run database migrations.** Do not run `bun migrate`, `bun --cwd server migrate`, `drizzle-kit migrate`, `drizzle-kit push`, or any SQL that changes schema or data against any database. `.env.local` points at production, so "just trying it" is a production change. You may edit `server/src/db/schema.ts` and generate migration files with `bun --cwd server generate-migrations`, and commit them. Running them is Hank's call — ask first.
- **Non-breaking backend changes are fine.** Adding routes, adding optional response fields, adding nullable columns or new tables, and new metrics are all OK without asking. Do not remove or rename API fields, routes, query params, metrics or columns that the client, the MCP plugin, the streamer or Prometheus scrapers depend on unless the task explicitly asks for it. If a change is breaking, say so in **Special things to note**.
- **Call out deploy ordering.** If the code needs a migration to have run first (for example it reads a new column), say so in **Special things to note**, and keep the server working until the migration has run where you reasonably can.
- **UI changes need visuals.** Any PR that changes what a user sees in `client/` gets before/after screenshots, or a short recording when the change is about motion, interaction or live updates. Skip visuals only for changes with no visible effect, and say why in the PR.

## Workflow

1. **Find or create the PR.**
   - `gh pr view --json url,number,title,state,baseRefName,headRefName 2>/dev/null`
   - With no PR: check `git status --short --branch` and the branch's commits, commit task-related work, push with an upstream, and open the PR against `main` with `gh pr create`. Never push to `main`.
   - Before any GitHub write, check `gh api user -q .login` is the identity you are meant to write as.

2. **Gather context.** Read the issue, the full diff (`git diff main...HEAD`), and enough surrounding code to explain behavior. Read `references/pr_description_template.md` and `references/show-me.md`.

3. **Capture visuals** (UI changes — see below).

4. **Write the description** from `references/pr_description_template.md` into `tmp/pr-description.md` (`tmp/` is gitignored):
   - **Why the change**: exactly one sentence.
   - **Special things to note**: 1-3 bullets. Migrations (and that they have *not* been run), breaking changes, deploy ordering, deliberate omissions, surprising choices. `- None.` if there are none.
   - **Screenshots**: before/after table or recording. Omit the section for changes with no visible effect.
   - **Change outline**: the smallest set of `show-me` views that explain the change — SQL/API contract diffs, key types, a shallow file tree, React component tree, call/data flow. Prefer `diff` blocks for changes to existing shapes.
   - No Testing section: CI shows the checks. Don't mention deploys, approvals or who decides them.
   - End with `Closes #N` when the PR resolves an issue.

5. **Publish**: `gh pr edit <number> --body-file tmp/pr-description.md`, then `gh pr view <number> --json body` to confirm it took. Check each asset URL returns 200 (`curl -sI <url>`).

6. **Report**: PR link, a 2-3 sentence summary, and changed files with a short note each.

Write like one person explaining something to another. Plain words, short sentences, no filler.

## Capturing visuals

Capture **before** from the base branch and **after** from your branch, both running locally against the production API and streamer, so the only difference is the code. Don't use `https://slotwatch.dev` as "before": it's whatever was last deployed, not necessarily `main`.

### 1. Serve both versions

Both servers go through the [portless](https://github.com/vercel-labs/portless) HTTPS proxy. Start it once per machine (it listens on 443, so it needs sudo):

```bash
sudo env "PATH=$PATH" "HOME=$HOME" node "$(readlink -f client/node_modules/.bin/portless)" proxy start --https
```

Then, from the repo root, in the background:

```bash
bun dev:client:tee                                     # your branch -> https://slotwatch.localhost
.agents/skills/slot-watch-pr/scripts/serve-ref.sh      # origin/main -> https://slotwatch-main.localhost
.agents/skills/slot-watch-pr/scripts/serve-ref.sh <ref> # any ref -> https://slotwatch-<ref>.localhost
```

`serve-ref.sh` exports the ref with `git archive` into `tmp/refs/<ref>/` (no worktree, no checkout), runs `bun install`, and starts Vite there. It re-exports only when the ref's commit changes. Wait until `curl -s -o /dev/null -w '%{http_code}' https://slotwatch.localhost/` returns `200`. The first page load compiles routes, so give it a few seconds more.

`bun dev:client:tee` needs `unbuffer` (`sudo apt-get install expect` on Linux, `brew install expect` on macOS).

### 2. Capture

`scripts/capture.mjs` drives headless Chrome with Playwright. On first run it installs `playwright-core` and, for recordings, Playwright's ffmpeg build into `~/.cache`, so the repo gains no dependency. It needs Chrome or Chromium (`CHROME_PATH` to override).

```bash
CAPTURE=.agents/skills/slot-watch-pr/scripts/capture.mjs

# Screenshots (2x PNG)
node $CAPTURE --url https://slotwatch-main.localhost/signers --out tmp/pr-assets/before-signers.png
node $CAPTURE --url https://slotwatch.localhost/signers      --out tmp/pr-assets/after-signers.png

# Just one element, the full page, light mode, or after clicking something
node $CAPTURE --url ... --out ... --selector 'header'
node $CAPTURE --url ... --out ... --full-page
node $CAPTURE --url ... --out ... --theme light
node $CAPTURE --url ... --out ... --click 'button[aria-label="Expand"]'

# Recordings: Playwright's native video. .gif writes a GIF plus a full-quality .webm next to it.
# Clicks happen during the recording, so the interaction is visible.
node $CAPTURE --url https://slotwatch.localhost --out tmp/pr-assets/after-nav.gif \
  --click 'a[href="/signers"]' --duration 4000
```

Notes:

- The default wait is 5s after load, because pages fill in from SSE. Raise `--wait` for slow pages. Never wait for network idle: SSE connections never go idle.
- Live data moves fast (a new block every few seconds). Capture before and after back to back, and crop with `--selector` when the rest of the page is noise.
- Both local servers are dev builds, so the TanStack Router devtools badge shows in the bottom-left corner of both. That's expected.
- Look at every capture before you use it (`Read` the PNG; for videos, pull a frame with `ffmpeg -sseof -0.5 -i x.webm -frames:v 1 x.png`). Loading spinners, empty states and error toasts are not useful.
- Keep recordings short (5-10s). The page-load part is trimmed off automatically with the system `ffmpeg`. Without it you get an untrimmed `.webm` and no GIF.
- For multi-step interactions the CLI can't express, copy `capture.mjs` to `tmp/` and script the steps with Playwright directly.
- To let a human click around your branch, expose it from a Boat VM with `host <vite-port> --localhost` (the port is in `client/tmp/dev-server.log`). Only share that URL on purpose.

### 3. Upload to R2

Assets go in the public R2 bucket `slot-watch-pr-assets`, served at `https://pr-assets.slotwatch.dev`:

```bash
bun .agents/skills/slot-watch-pr/scripts/upload.ts tmp/pr-assets/*
# tmp/pr-assets/after-signers.png -> https://pr-assets.slotwatch.dev/<branch>/<hash>-after-signers.png
```

- Keys are `<branch>/<content-hash>-<filename>` (`--prefix` to override). A changed file gets a new URL, so GitHub's image cache never shows a stale version.
- Auth uses the `stackslabs` alchemy profile (`bun alchemy login --profile stackslabs` if it's missing or expired).
- The bucket and its domain are defined in `scripts/pr-assets.run.ts`, a separate alchemy app from `alchemy.run.ts`. It's already created; you only need it to change the bucket. It never deploys the API, website or streamer.
- Everything uploaded is public. Only upload screenshots of public Slot Watch pages.

### 4. Embed

GitHub displays images from any HTTPS URL inline, but it won't play videos hosted outside GitHub. Embed the GIF and link the `.webm`:

```markdown
| Before | After |
| --- | --- |
| <img src="https://pr-assets.slotwatch.dev/.../before-signers.png" width="600"> | <img src="https://pr-assets.slotwatch.dev/.../after-signers.png" width="600"> |

<img src="https://pr-assets.slotwatch.dev/.../after-nav.gif" width="800">

[Full-quality recording (WebM)](https://pr-assets.slotwatch.dev/.../after-nav.webm)
```

Never commit screenshots or recordings to the repo.
