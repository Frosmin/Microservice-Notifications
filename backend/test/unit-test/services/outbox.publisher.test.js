import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enqueueOutboxEvent: vi.fn(),
  lockNextOutboxEvent: vi.fn(),
  markOutboxPublished: vi.fn(),
  markOutboxPublicationFailed: vi.fn()
}));
vi.mock('../../../src/infrastructure/db.transaction.js', () => ({
  withTransaction: vi.fn((operation) => operation({ query: vi.fn() }))
}));
vi.mock('../../../src/queues/notification.queue.js', () => ({
  enqueueOutboxEvent: mocks.enqueueOutboxEvent
}));
vi.mock('../../../src/repositories/outbox.repository.js', () => ({
  lockNextOutboxEvent: mocks.lockNextOutboxEvent,
  markOutboxPublished: mocks.markOutboxPublished,
  markOutboxPublicationFailed: mocks.markOutboxPublicationFailed
}));
vi.mock('../../../src/utils/config.js', () => ({
  default: {
    OUTBOX_MAX_BACKOFF_MS: 8000,
    RETRY_BACKOFF_MS: 1000,
    OUTBOX_BATCH_SIZE: 2,
    OUTBOX_POLL_INTERVAL_MS: 100
  }
}));

import {
  outboxBackoff,
  publishNextOutboxEvent,
  publishOutboxBatch,
  startOutboxPublisher
} from '../../../src/services/outbox.publisher.js';

describe('outbox.publisher.js', () => {
  const queue = {};
  const logger = { warn: vi.fn(), error: vi.fn() };
  beforeEach(() => vi.clearAllMocks());

  it('publishes and acknowledges one locked event', async () => {
    const event = { id: '1', notificationId: '9', publishAttempts: 0 };
    mocks.lockNextOutboxEvent.mockResolvedValue(event);
    mocks.enqueueOutboxEvent.mockResolvedValue({ id: 'outbox-1' });
    await expect(publishNextOutboxEvent(queue, logger)).resolves.toBe(true);
    expect(mocks.enqueueOutboxEvent).toHaveBeenCalledWith(queue, event);
    expect(mocks.markOutboxPublished).toHaveBeenCalledWith(expect.anything(), '1');
  });

  it('keeps a failed event pending with capped exponential backoff', async () => {
    mocks.lockNextOutboxEvent.mockResolvedValue({ id: '1', notificationId: '9', publishAttempts: 3 });
    mocks.enqueueOutboxEvent.mockRejectedValue(new Error('redis down'));
    await expect(publishNextOutboxEvent(queue, logger)).resolves.toBe(true);
    expect(mocks.markOutboxPublicationFailed).toHaveBeenCalledWith(
      expect.anything(), '1', 'redis down', 8000
    );
    expect(mocks.markOutboxPublished).not.toHaveBeenCalled();
  });

  it('reports no work and bounds a batch', async () => {
    mocks.lockNextOutboxEvent
      .mockResolvedValueOnce({ id: '1', publishAttempts: 0 })
      .mockResolvedValueOnce({ id: '2', publishAttempts: 0 })
      .mockResolvedValueOnce(undefined);
    mocks.enqueueOutboxEvent.mockResolvedValue({});
    await expect(publishOutboxBatch(queue, logger)).resolves.toBe(2);
    expect(mocks.lockNextOutboxEvent).toHaveBeenCalledTimes(2);
    mocks.lockNextOutboxEvent.mockResolvedValue(undefined);
    await expect(publishNextOutboxEvent(queue, logger)).resolves.toBe(false);
  });

  it('caps publication backoff and starts/stops polling safely', async () => {
    expect(outboxBackoff(0)).toBe(1000);
    expect(outboxBackoff(99)).toBe(8000);
    mocks.lockNextOutboxEvent.mockResolvedValue(undefined);
    const stop = startOutboxPublisher(queue, logger);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await stop();
    expect(mocks.lockNextOutboxEvent).toHaveBeenCalled();
  });

  it('waits for an active batch before stopping without scheduling another poll', async () => {
    let resolveLock;
    mocks.lockNextOutboxEvent.mockImplementationOnce(() => new Promise((resolve) => {
      resolveLock = resolve;
    }));

    const stop = startOutboxPublisher(queue, logger);
    let stopped = false;
    const stopping = stop().then(() => {
      stopped = true;
    });

    await Promise.resolve();
    expect(stopped).toBe(false);
    expect(mocks.lockNextOutboxEvent).toHaveBeenCalledTimes(1);

    resolveLock(undefined);
    await stopping;
    expect(stopped).toBe(true);
    expect(mocks.lockNextOutboxEvent).toHaveBeenCalledTimes(1);
  });
});
