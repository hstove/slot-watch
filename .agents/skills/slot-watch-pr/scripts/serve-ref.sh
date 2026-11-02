#!/usr/bin/env bash
# Serve the client from any git ref (default: origin/main) next to your branch's dev server,
# so "before" screenshots come from the code you're diffing against instead of production.
#
#   .agents/skills/slot-watch-pr/scripts/serve-ref.sh            # origin/main
#   .agents/skills/slot-watch-pr/scripts/serve-ref.sh <ref>
#
# Serves at https://slotwatch-<ref>.localhost (via the portless proxy), using the production
# API and streamer like `bun dev:client:tee`. Runs in the foreground; stop it with Ctrl-C.
# The ref is exported with `git archive` into tmp/refs/, so no worktree or branch is touched.
set -euo pipefail

ref="${1:-origin/main}"
root="$(git rev-parse --show-toplevel)"
slug="$(echo "${ref#origin/}" | tr -c 'a-zA-Z0-9\n' '-')"
dir="$root/tmp/refs/$slug"

git -C "$root" fetch --quiet origin 2>/dev/null || true
sha="$(git -C "$root" rev-parse "$ref")"

if [[ "$(cat "$dir/.sha" 2>/dev/null)" != "$sha" ]]; then
  echo "Exporting $ref ($sha) to $dir"
  rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$root" archive "$sha" | tar -x -C "$dir"
  (cd "$dir" && bun install --frozen-lockfile >/dev/null)
  echo "$sha" >"$dir/.sha"
fi

echo "Serving $ref at https://slotwatch-$slug.localhost"
cd "$dir/client"
exec bunx portless "slotwatch-$slug" vite
