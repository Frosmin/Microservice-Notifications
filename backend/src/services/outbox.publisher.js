import { withTransaction } from '../infrastructure/db.transaction.js';
import { enqueueOutboxEvent } from '../queues/notification.queue.js';
import {
  lockNextOutboxEvent,
  markOutboxPublicationFailed,
  markOutboxPublished
} from '../repositories/outbox.repository.js';
import config from '../utils/config.js';

export const outboxBackoff = (attempt) => Math.min(
  config.OUTBOX_MAX_BACKOFF_MS,
  config.RETRY_BACKOFF_MS * (2 ** Math.min(attempt, 16))
);

export const publishNextOutboxEvent = (queue, logger = console) => withTransaction(
  async (client) => {
    const event = await lockNextOutboxEvent(client);
    if (!event) return false;
    try {
      await enqueueOutboxEvent(queue, event);
      await markOutboxPublished(client, event.id);
    } catch (error) {
      const delay = outboxBackoff(event.publishAttempts);
      await markOutboxPublicationFailed(client, event.id, error.message, delay);
      logger.warn(`Outbox ${event.id} will be retried in ${delay}ms`, error);
    }
    return true;
  }
);

export const publishOutboxBatch = async (queue, logger = console) => {
  let processed = 0;
  while (processed < config.OUTBOX_BATCH_SIZE) {
    const found = await publishNextOutboxEvent(queue, logger);
    if (!found) break;
    processed += 1;
  }
  return processed;
};

export const startOutboxPublisher = (queue, logger = console) => {
  let running = false;
  let stopped = false;
  let activePoll;
  const poll = () => {
    if (running || stopped) return;
    running = true;
    activePoll = (async () => {
      try {
        await publishOutboxBatch(queue, logger);
      } catch (error) {
        logger.error('Outbox publisher error', error);
      } finally {
        running = false;
      }
    })();
  };
  const timer = setInterval(poll, config.OUTBOX_POLL_INTERVAL_MS);
  timer.unref();
  poll();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await activePoll;
  };
};
