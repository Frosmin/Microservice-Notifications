import { UnrecoverableError } from 'bullmq';
import { withConnection } from '../infrastructure/db.transaction.js';
import {
  acquireNotificationLock,
  findNotificationForDelivery,
  markNotificationFailed,
  recordDeliveryAttempt,
  releaseNotificationLock
} from '../repositories/delivery.repository.js';
import {
  isPermanentDeliveryError,
  PermanentDeliveryError
} from '../providers/delivery.errors.js';
import { renderTemplate } from '../providers/template.renderer.js';
import config from '../utils/config.js';

const errorDetail = (error) => error?.message || String(error);

export const createNotificationProcessor = ({
  emailSender,
  smsSender,
  maxAttempts = config.MAX_NOTIFICATION_ATTEMPTS
}) => async (job) => withConnection(async (client) => {
  const notificationId = String(job.data.notificationId);
  await acquireNotificationLock(client, notificationId);
  try {
    const notification = await findNotificationForDelivery(client, notificationId);
    if (!notification) {
      throw new UnrecoverableError(`Notification ${notificationId} does not exist`);
    }
    if (notification.estado === 'ENVIADA') {
      return { skipped: true, reason: 'already-sent' };
    }
    if (notification.estado === 'FALLIDA' || notification.intentos >= maxAttempts) {
      await markNotificationFailed(client, notificationId);
      throw new UnrecoverableError(`Notification ${notificationId} exhausted its attempts`);
    }

    try {
      const message = renderTemplate(notification.templateContent, notification.variables);
      const sender = {
        EMAIL: emailSender,
        SMS: smsSender
      }[notification.canal];
      if (!sender) {
        throw new PermanentDeliveryError(`Unsupported channel: ${notification.canal}`);
      }
      const providerResult = await sender({
        notificationId,
        to: notification.destinatario,
        subject: notification.templateName,
        message
      });
      await recordDeliveryAttempt(client, {
        notificationId,
        resultado: 'EXITOSO',
        detalle: providerResult?.messageId || 'Accepted by provider',
        estado: 'ENVIADA'
      });
      return { sent: true };
    } catch (error) {
      const terminal = isPermanentDeliveryError(error)
        || notification.intentos + 1 >= maxAttempts;
      await recordDeliveryAttempt(client, {
        notificationId,
        resultado: 'FALLIDO',
        detalle: errorDetail(error),
        estado: terminal ? 'FALLIDA' : 'ENCOLADA'
      });
      if (terminal) {
        throw new UnrecoverableError(errorDetail(error));
      }
      throw error;
    }
  } finally {
    await releaseNotificationLock(client, notificationId);
  }
});
