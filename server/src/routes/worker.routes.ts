// import { Hono } from 'hono';
// import { workerQueue } from '../worker/queue';

// const workerRoutes = new Hono().get('/worker-metrics', async (c) => {
//   const metrics = await workerQueue.getJobCounts();
//   return c.json(metrics);
// });

// export default workerRoutes;
