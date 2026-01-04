import type { HonoRequest } from 'hono';
import { log } from './logger';
import { env } from 'cloudflare:workers';

function getBasicAuthHono(request: HonoRequest) {
  const authHeader = request.header('Authorization');

  // biome-ignore lint/complexity/useOptionalChain: ignored using `--suppress`
  if (!(authHeader && authHeader.startsWith('Basic '))) {
    log.debug('No auth (missing header)');
    return null;
  }

  const base64Credentials = authHeader.split(' ')[1];
  if (!base64Credentials) {
    return null;
  }
  const credentials = atob(base64Credentials);
  const [username, password] = credentials.split(':');
  if (!(username && password)) {
    return null;
  }

  return { username, password };
}

export function getNetworkKeyFromRequest(request: HonoRequest): string | null {
  const auth = getBasicAuthHono(request);
  if (!auth) {
    log.debug('No auth');
    return null;
  }

  if (auth.password !== env.OBSERVER_TOKEN) {
    log
      .withMetadata({
        password: auth.password,
        // expected: process.env.OBSERVER_TOKEN,
      })
      .warn('Invalid password');
    return null;
  }

  return auth.username;
}
