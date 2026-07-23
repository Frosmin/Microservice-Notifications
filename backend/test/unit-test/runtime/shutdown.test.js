import { describe, expect, it, vi } from 'vitest';
import {
  closeApiRuntime,
  closeWorkerRuntime
} from '../../../src/runtime/shutdown.js';

describe('runtime shutdown', () => {
  it('stops accepting HTTP before closing PostgreSQL', async () => {
    const order = [];
    const server = { close: vi.fn((callback) => { order.push('server'); callback(); }) };
    const closeDatabase = vi.fn(async () => { order.push('database'); });
    await closeApiRuntime({ server, closeDatabase });
    expect(order).toEqual(['server', 'database']);
  });

  it('propagates an HTTP close error without closing the database', async () => {
    const closeDatabase = vi.fn();
    await expect(closeApiRuntime({
      server: { close: (callback) => callback(new Error('close failed')) },
      closeDatabase
    })).rejects.toThrow('close failed');
    expect(closeDatabase).not.toHaveBeenCalled();
  });

  it('drains publisher and worker before Redis and PostgreSQL', async () => {
    const order = [];
    const step = (name) => vi.fn(async () => { order.push(name); });
    await closeWorkerRuntime({
      stopPublisher: step('publisher'),
      worker: { close: step('worker') },
      queue: { close: step('queue') },
      queueConnection: 'producer',
      workerConnection: 'consumer',
      closeRedis: vi.fn(async (connection) => { order.push(`redis-${connection}`); }),
      closeDatabase: step('database')
    });
    expect(order.slice(0, 3)).toEqual(['publisher', 'worker', 'queue']);
    expect(order.slice(3, 5).sort()).toEqual(['redis-consumer', 'redis-producer']);
    expect(order[5]).toBe('database');
  });
});
