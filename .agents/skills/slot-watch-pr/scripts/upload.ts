/**
 * Upload PR screenshots/recordings to the public R2 bucket and print markdown-ready URLs.
 *
 *   bun .agents/skills/slot-watch-pr/scripts/upload.ts tmp/pr-assets/*.png tmp/pr-assets/*.webm
 *   bun .agents/skills/slot-watch-pr/scripts/upload.ts --prefix pr-15 tmp/pr-assets/before.png
 *
 * Keys are `<prefix>/<content-hash>-<filename>`, so re-uploading a changed file gets a new URL
 * (no stale CDN cache) and identical files dedupe. The prefix defaults to the current branch.
 * Auth comes from the `stackslabs` alchemy login profile (`bun alchemy login --profile stackslabs`).
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { parseArgs } from 'node:util';
import { createCloudflareApi, putObject } from 'alchemy/cloudflare';
import { PR_ASSETS_BUCKET, PR_ASSETS_DOMAIN } from './pr-assets-config.ts';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.mp4': 'video/mp4',
};

const { values, positionals: files } = parseArgs({
  allowPositionals: true,
  options: { prefix: { type: 'string' } },
});

if (files.length === 0) {
  console.error('Usage: upload.ts [--prefix <dir>] <file>...');
  process.exit(1);
}

const branch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const prefix = (values.prefix ?? branch ?? 'misc').replace(
  /[^a-zA-Z0-9._-]+/g,
  '-'
);

const api = await createCloudflareApi({ profile: 'stackslabs' });

for (const file of files) {
  const contentType = CONTENT_TYPES[extname(file).toLowerCase()];
  if (!contentType) throw new Error(`Unsupported file type: ${file}`);
  const body = readFileSync(file);
  const hash = createHash('sha256').update(body).digest('hex').slice(0, 10);
  const key = `${prefix}/${hash}-${basename(file)}`;
  await putObject(api, {
    bucketName: PR_ASSETS_BUCKET,
    key,
    object: body,
    options: {
      httpMetadata: {
        contentType,
        cacheControl: 'public, max-age=31536000, immutable',
      },
    },
  });
  console.log(`${file} -> https://${PR_ASSETS_DOMAIN}/${key}`);
}
