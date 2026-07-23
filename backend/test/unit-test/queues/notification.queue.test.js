import { beforeEach, describe, expect, it, vi } from 'vitest';

const { Queue } = vi.hoisted(() => ({
  Queue: vi.fn(function QueueMock(name, options) {
    return { name, options, add: vi.fn() };
  })
}));
vi.mock('bullmq', () => ({ Queue }));
vi.mock('../../../src/utils/config.js', () => ({
  default: {
    NOTIFICATION_QUEUE: 'notification-delivery',
    MAX_NOTIFICATION_ATTEMPTS: 5,
    RETRY_BACKOFF_MS: 1000
  }
}));

import {
  createNotificationQueue,
  enqueueOutboxEvent
} from '../../../src/queues/notification.queue.js';

describe('notification.queue.js', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates the configured BullMQ queue with its injected connection', () => {
    const connection = {};
    expect(createNotificationQueue(connection)).toMatchObject({
      name: 'notification-delivery', options: { connection }
    });
  });

  it('publishes a deduplicated job with bounded retries and retention', async () => {
    const queue = { add: vi.fn().mockResolvedValue({ id: 'outbox-7' }) };
    const event = { id: '7', notificationId: '42' };
    await enqueueOutboxEvent(queue, event);
    expect(queue.add).toHaveBeenCalledWith(
      'deliver-notification',
      { outboxId: '7', notificationId: '42' },
      expect.objectContaining({
        jobId: 'outbox-7',
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000, jitter: 0.5 },
        removeOnComplete: { age: 3600, count: 1000 }
      })
    );
  });
});
