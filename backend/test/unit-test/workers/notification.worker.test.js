import { describe, expect, it, vi } from 'vitest';

const { Worker, on } = vi.hoisted(() => {
  const eventHandler = vi.fn();
  return {
    on: eventHandler,
    Worker: vi.fn(function WorkerMock(name, processor, options) {
      return { name, processor, options, on: eventHandler };
    })
  };
});
vi.mock('bullmq', () => ({ Worker }));
vi.mock('../../../src/utils/config.js', () => ({
  default: {
    NOTIFICATION_QUEUE: 'notification-delivery',
    WORKER_CONCURRENCY: 5,
    SENDS_PER_MINUTE: 60
  }
}));

import { createNotificationWorker } from '../../../src/workers/notification.worker.js';

describe('notification.worker.js', () => {
  it('uses configured concurrency and the global send rate limit', () => {
    const connection = {};
    const processor = vi.fn();
    const worker = createNotificationWorker({
      connection, processor, logger: { error: vi.fn() }
    });
    expect(worker).toMatchObject({
      name: 'notification-delivery',
      processor,
      options: {
        connection,
        concurrency: 5,
        limiter: { max: 60, duration: 60000 }
      }
    });
    expect(on).toHaveBeenCalledWith('failed', expect.any(Function));
    expect(on).toHaveBeenCalledWith('error', expect.any(Function));
  });
});
