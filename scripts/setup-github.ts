/**
 * One-time (idempotent) GitHub setup for preview deployments, managed with
 * Alchemy. Run by a maintainer, not CI:
 *
 *   bun setup:github
 *
 * Reads `PREVIEW_DATABASE_PASSWORD` from `.env.local` and uses your `gh` CLI
 * login (or GITHUB_TOKEN). See history/2026-11-02-preview-deployments.md for the full
 * checklist, including the read-only Postgres role this password belongs to.
 */
import alchemy from 'alchemy';
import { GitHubSecret, RepositoryEnvironment } from 'alchemy/github';

const owner = 'hstove';
const repository = 'slot-watch';

const password = process.env.PREVIEW_DATABASE_PASSWORD;
if (!password) {
  throw new Error('PREVIEW_DATABASE_PASSWORD must be set (e.g. in .env.local)');
}

const app = await alchemy('slot-watch-github', {
  stage: 'github',
  password: process.env.ALCHEMY_PASSWORD,
});

/** Environment used by `.github/workflows/preview.yml`'s deploy job. */
const preview = await RepositoryEnvironment('preview-environment', {
  owner,
  repository,
  name: 'preview',
});

await GitHubSecret('preview-database-password', {
  owner,
  repository,
  environment: preview.name,
  name: 'PREVIEW_DATABASE_PASSWORD',
  value: alchemy.secret(password),
});

await app.finalize();
