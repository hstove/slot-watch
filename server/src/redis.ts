import { createClient } from 'redis';

export const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

await redisClient.connect();

export const subClient = redisClient.duplicate();
subClient.on('error', (err) => console.log('Redis Sub Client Error', err));

await subClient.connect();
