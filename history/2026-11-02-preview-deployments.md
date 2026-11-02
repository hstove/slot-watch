# CI & preview deployments (#16)

Added in PR #17.

- **CI** (`.github/workflows/ci.yml`): runs `bun check:all` on every PR and push to `main`, and fails if it leaves a diff.
- **Previews** (`.github/workflows/preview.yml`): each PR deploys Alchemy stage `pr-<N>` and destroys it when the PR closes. Only same-repo PRs from owners, members and collaborators deploy, and only while the repo variable `PREVIEW_DEPLOYMENTS` is `true`.
- **Preview vs prod** (`alchemy.run.ts`): any stage other than `prod` is a preview.
  - Resources get a stage suffix and never adopt prod resources.
  - The website is at `pr-<N>-preview.slotwatch.dev` and the API on `workers.dev`.
  - It connects as the read-only Postgres role `slot_watch_readonly` (`PREVIEW_DATABASE_PASSWORD`).
  - Ingest, cron and the miner-commits watcher are off, and there's no streamer deploy.
- **Hostname:** the first version used `pr-<N>.preview.slotwatch.dev`, which waited about 3 minutes per PR for a dedicated TLS cert. One level deep is covered by the zone's `*.slotwatch.dev` Universal SSL cert immediately.
- **Caveat:** `alchemy destroy` exits 0 even if a delete fails. To remove a leftover preview by hand, run `bun alchemy destroy --stage pr-<N> --env-file .env.local --profile stackslabs`.
