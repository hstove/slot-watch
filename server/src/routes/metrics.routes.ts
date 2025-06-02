import { Hono } from 'hono';
import { warmupMetrics } from '../metrics';
import { register, Registry } from 'prom-client';

// process.nextTick(async () => {
//   await warmupMetrics();
// });

export const metricsRoutes = new Hono().get('/metrics', async (c) => {
  // process.nextTick(async () => {
  //   await warmupMetrics();
  // });
  await warmupMetrics();
  // @ts-ignore
  register.setContentType(Registry.OPENMETRICS_CONTENT_TYPE);
  const metrics = await register.metrics();
  return c.text(metrics, 200);
});
