import { Worker } from 'bullmq';
import config from '../utils/config.js';

export const createNotificationWorker = ({ connection, processor, logger = console }) => {
  const worker = new Worker(config.NOTIFICATION_QUEUE, processor, {
    connection,
    concurrency: config.WORKER_CONCURRENCY,
    limiter: {
      max: config.SENDS_PER_MINUTE,
      duration: 60000 // 1 minuto
    }
  });
  worker.on('failed', (job, error) => {
    logger.error(`Notification job ${job?.id || 'unknown'} failed`, error);
  });
  worker.on('error', (error) => logger.error('BullMQ worker error', error));
  return worker;
};
