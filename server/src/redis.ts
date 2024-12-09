import Redis from 'ioredis';

// export const redisClient = createClient({
//   url: process.env.REDIS_URL,
// });

const redisURL = process.env.REDIS_URL ?? 'redis://localhost:6379';

export const redisClient = new Redis(redisURL);
redisClient.on('error', (err) => console.log('Redis Client Error', err));

// await redisClient.connect();

export const subClient = redisClient.duplicate();
subClient.on('error', (err) => console.log('Redis Sub Client Error', err));

// await subClient.connect();
