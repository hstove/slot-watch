import { logger as _logger, log } from './logger';
import type { WSPayload } from 'slot-watch-common';
import { env } from 'cloudflare:workers';

const logger = log.child().withContext({
  module: 'streamer',
});

export async function publishWsEventToStreamer(payload: WSPayload) {
  try {
    const url = env.STREAMER_URL;
    const res = await fetch(`${url}/${payload.networkKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const status = res.status;
    logger
      .withMetadata({
        url,
        status,
        payloadType: payload.type,
      })
      .info('Published event to streamer');
  } catch (error) {
    logger
      .withError(error)
      .withMetadata({
        payloadType: payload.type,
      })
      .error('Error publishing event to streamer');
  }
}
