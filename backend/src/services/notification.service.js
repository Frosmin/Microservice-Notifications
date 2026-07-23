import { findTemplateById } from '../repositories/template.repository.js';
import {
  findNotificationById,
  findNotificationByIdForUpdate,
  findNotificationByIdempotencyKey,
  findNotificationsPage,
  insertNotification,
  scheduleNotificationRetry
} from '../repositories/notification.repository.js';
import { findAttemptsByNotificationId } from '../repositories/attempt.repository.js';
import { withTransaction } from '../infrastructure/db.transaction.js';
import config from '../utils/config.js';
import { errorCodes, setError } from '../utils/errorCodes.js';

const haveSameKeys = (received, required) => {
  const receivedKeys = Object.keys(received).sort((a, b) => a.localeCompare(b));
  const requiredKeys = [...required].sort((a, b) => a.localeCompare(b));
  return receivedKeys.length === requiredKeys.length
    && receivedKeys.every((key, index) => key === requiredKeys[index]);
};

const sameVariables = (left, right) => {
  const leftKeys = Object.keys(left).sort((a, b) => a.localeCompare(b));
  const rightKeys = Object.keys(right).sort((a, b) => a.localeCompare(b));
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key, index) => (
      key === rightKeys[index] && Object.is(left[key], right[key])
    ));
};

const isSameRequest = (notification, request) => (
  notification.canal === request.canal
  && notification.destinatario === request.destinatario
  && String(notification.plantillaId) === String(request.plantillaId)
  && sameVariables(notification.variables, request.variables)
);

export const createNotificationService = async (request, idempotencyKey) => {
  const template = await findTemplateById(request.plantillaId);
  if (!template) {
    throw setError('Template not found', errorCodes.NOT_FOUND);
  }

  if (template.canal !== request.canal
    || !haveSameKeys(request.variables, template.variables)) {
    throw setError('Notification does not match template', errorCodes.MISSING_REQUIRED_PARAMETER);
  }

  const created = await insertNotification({ ...request, idempotencyKey });
  if (!created) {
    const existing = await findNotificationByIdempotencyKey(idempotencyKey);
    if (!existing || !isSameRequest(existing, request)) {
      throw setError('Idempotency key already used', errorCodes.RESOURCE_CONFLICT);
    }
    return { notification: existing, created: false };
  }

  return { notification: created, created: true };
};

export const getNotificationService = async (id) => {
  const notification = await findNotificationById(id);
  if (!notification) {
    throw setError('Notification not found', errorCodes.NOT_FOUND);
  }

  const historialIntentos = await findAttemptsByNotificationId(id);
  return { ...notification, historialIntentos };
};

export const listNotificationsService = async ({
  canal,
  estado,
  page,
  limit
}) => {
  const offset = (BigInt(page - 1) * BigInt(limit)).toString();
  const { items, totalItems } = await findNotificationsPage({
    canal,
    estado,
    limit,
    offset
  });

  return {
    items,
    pagination: {
      page,
      limit,
      totalItems,
      totalPages: Math.ceil(totalItems / limit)
    }
  };
};

export const retryBackoff = (attempts) => (
  config.RETRY_BACKOFF_MS * (2 ** Math.max(attempts - 1, 0))
);

export const retryNotificationService = async (id) => withTransaction(async (client) => {
  const notification = await findNotificationByIdForUpdate(client, id);
  if (!notification) {
    throw setError('Notification not found', errorCodes.NOT_FOUND);
  }
  if (notification.estado !== 'FALLIDA') {
    throw setError('Only failed notifications can be retried', errorCodes.RESOURCE_CONFLICT);
  }
  if (notification.intentos >= config.MAX_NOTIFICATION_ATTEMPTS) {
    throw setError('Maximum notification attempts reached', errorCodes.RESOURCE_CONFLICT);
  }

  return scheduleNotificationRetry(
    client,
    id,
    retryBackoff(notification.intentos)
  );
});
