/**
 * Public R2 bucket for PR screenshots and recordings, served at https://pr-assets.slotwatch.dev.
 *
 * This is its own alchemy app, separate from the main `slot-watch` app in alchemy.run.ts,
 * so creating or updating the bucket never redeploys the API, website or streamer.
 *
 *   bun --env-file .env.local .agents/skills/slot-watch-pr/scripts/pr-assets.run.ts
 *
 * Needs ALCHEMY_STATE_TOKEN (shared state store) and the `stackslabs` alchemy login profile.
 * Only needed once; uploading assets is done by upload.ts.
 */
import alchemy from 'alchemy';
import { R2Bucket } from 'alchemy/cloudflare';
import { CloudflareStateStore } from 'alchemy/state';
import {
  PR_ASSETS_BUCKET,
  PR_ASSETS_DOMAIN,
  PR_ASSETS_ZONE_ID,
} from './pr-assets-config.ts';

const app = await alchemy('slot-watch-pr-assets', {
  stage: 'prod',
  profile: 'stackslabs',
  phase: process.argv.includes('--destroy') ? 'destroy' : 'up',
  stateStore: (scope) => new CloudflareStateStore(scope),
});

const bucket = await R2Bucket('pr-assets', {
  name: PR_ASSETS_BUCKET,
  domains: { domain: PR_ASSETS_DOMAIN, zone: PR_ASSETS_ZONE_ID },
  adopt: true,
  // Never delete uploaded screenshots when the resource is removed: old PRs link to them.
  delete: false,
});

console.log(`Bucket ${bucket.name} served at https://${PR_ASSETS_DOMAIN}`);

await app.finalize();
