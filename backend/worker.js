import 'dotenv/config';
import { closeAllConnections, initializeDB } from '@tigo/postgres-connector';
import {
  closeRedisConnection,
  createQueueRedisConnection,
  createWorkerRedisConnection
} from './src/infrastructure/redis.client.js';
import { createNotificationQueue } from './src/queues/notification.queue.js';
import { createEmailSender } from './src/providers/email.sender.js';
import { createSmsSender } from './src/providers/sms.sender.js';
import { startOutboxPublisher } from './src/services/outbox.publisher.js';
import { closeWorkerRuntime } from './src/runtime/shutdown.js';
import { createNotificationProcessor } from './src/workers/notification.processor.js';
import { createNotificationWorker } from './src/workers/notification.worker.js';

await initializeDB();

const queueConnection = createQueueRedisConnection();
const workerConnection = createWorkerRedisConnection();
const queue = createNotificationQueue(queueConnection);
queue.on('error', (error) => console.error('BullMQ queue error', error));
const processor = createNotificationProcessor({
  emailSender: createEmailSender(),
  smsSender: createSmsSender()
});
const worker = createNotificationWorker({ connection: workerConnection, processor });
const stopPublisher = startOutboxPublisher(queue);

console.log('Notification worker and outbox publisher started');

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, closing notification worker`);
  await closeWorkerRuntime({
    stopPublisher,
    worker,
    queue,
    queueConnection,
    workerConnection,
    closeRedis: closeRedisConnection,
    closeDatabase: closeAllConnections
  });
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Worker shutdown failed', error);
        process.exit(1);
      });
  });
}
