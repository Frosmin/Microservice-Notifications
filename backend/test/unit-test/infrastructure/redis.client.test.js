import { beforeEach, describe, expect, it, vi } from 'vitest';

const { quit, Redis } = vi.hoisted(() => {
  const quitMock = vi.fn();
  return {
    quit: quitMock,
    Redis: vi.fn(function RedisMock(options) {
      return { options, quit: quitMock, status: 'ready' };
    })
  };
});

vi.mock('ioredis', () => ({ default: Redis }));
vi.mock('../../../src/utils/config.js', () => ({
  default: { REDIS_HOST: 'localhost', REDIS_PORT: 6379, REDIS_PASSWORD: 'secret' }
}));

import {
  closeRedisConnection,
  createQueueRedisConnection,
  createWorkerRedisConnection
} from '../../../src/infrastructure/redis.client.js';

describe('redis.client.js', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses fail-fast connections for Queue producers', () => {
    const connection = createQueueRedisConnection();
    expect(connection.options).toMatchObject({ maxRetriesPerRequest: 1 });
  });

  it('uses unlimited request retries for BullMQ workers', () => {
    const connection = createWorkerRedisConnection();
    expect(connection.options).toMatchObject({ maxRetriesPerRequest: null });
  });

  it('closes active connections and ignores absent or ended ones', async () => {
    await closeRedisConnection({ status: 'ready', quit });
    await closeRedisConnection({ status: 'end', quit });
    await closeRedisConnection(undefined);
    expect(quit).toHaveBeenCalledOnce();
  });
});
