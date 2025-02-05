import { Hono } from 'hono';
import { workerQueue } from '../worker/queue';

const workerRoutes = new Hono().get('/worker-metrics', async (c) => {
  const metrics = await workerQueue.exportPrometheusMetrics();
  return c.text(metrics);
});

export default workerRoutes;
