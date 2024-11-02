import { Hono } from 'hono';
import { warmupMetrics } from '../metrics';
import { register, Registry } from 'prom-client';

export const metricsRoutes = new Hono().get('/metrics', async (c) => {
  process.nextTick(async () => {
    await warmupMetrics();
  });
  // @ts-ignore
  register.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
  const metrics = await register.metrics();
  return c.text(metrics, 200);
});
