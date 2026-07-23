import { Queue } from 'bullmq';
import config from '../utils/config.js';

export const createNotificationQueue = (connection) => new Queue(
  config.NOTIFICATION_QUEUE,
  { connection }
);

export const enqueueOutboxEvent = (queue, event) => queue.add(
  'deliver-notification',
  {
    outboxId: String(event.id),
    notificationId: String(event.notificationId)
  },
  {
    jobId: `outbox-${event.id}`,
    attempts: config.MAX_NOTIFICATION_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: config.RETRY_BACKOFF_MS,
      jitter: 0.5
    },
    removeOnComplete: { age: 3600, count: 1000 },
    removeOnFail: { age: 86400, count: 5000 }
  }
);
