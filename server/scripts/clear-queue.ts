import { workerQueue } from '../src/worker/queue';

const metrics = await workerQueue.getJobCounts();

console.log(metrics);

while (true) {
  const metrics = await workerQueue.getJobCounts();
  console.log(metrics.waiting);
  await new Promise((resolve) => setTimeout(resolve, 5000));
}

process.exit(0);
