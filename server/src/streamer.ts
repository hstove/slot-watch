import { logger as _logger, log } from './logger';
import type { WSPayload } from 'slot-watch-common';
import { env } from 'cloudflare:workers';

const logger = log.child().withContext({
  module: 'streamer',
});

export async function publishWsEventToStreamer(payload: WSPayload) {
  try {
    const url = env.STREAMER_URL;
    await fetch(`${url}/${payload.networkKey}`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger
      .withError(error)
      .withMetadata({
        payloadType: payload.type,
      })
      .error('Error publishing event to streamer');
  }
}
