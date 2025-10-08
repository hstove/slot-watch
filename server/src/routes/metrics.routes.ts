import { Hono } from 'hono';
import { warmupMetrics } from '../metrics';
import { register, Registry } from 'prom-client';
import type { ServerType } from '../server-context';

export const metricsRoutes = new Hono<ServerType>().get(
  '/metrics',
  async (c) => {
    await warmupMetrics(c.get('db'));
    // @ts-ignore
    register.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
    const metrics = await register.metrics();
    return c.text(metrics, 200);
  },
);
