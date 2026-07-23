import Redis from 'ioredis';
import config from '../utils/config.js';

const redisOptions = (maxRetriesPerRequest) => ({
    host: config.REDIS_HOST,
    port: config.REDIS_PORT,
    password: config.REDIS_PASSWORD,
    maxRetriesPerRequest
});

export const createQueueRedisConnection = () => new Redis(redisOptions(1));

export const createWorkerRedisConnection = () => new Redis(redisOptions(null));

export const closeRedisConnection = async (connection) => {
  if (!connection || connection.status === 'end') return;
  await connection.quit();
};
