import { workerQueue } from '../src/worker/queue';

const metrics = await workerQueue.getJobCounts();

console.log(metrics);

while (true) {
  const metrics = await workerQueue.getJobCounts();
  console.log(`Waiting: ${metrics.waiting}. Active: ${metrics.active}.`);
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
