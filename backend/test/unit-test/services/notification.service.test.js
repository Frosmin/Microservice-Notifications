import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionClient } = vi.hoisted(() => ({ transactionClient: { query: vi.fn() } }));

vi.mock('../../../src/repositories/template.repository.js', () => ({
  findTemplateById: vi.fn()
}));
vi.mock('../../../src/repositories/notification.repository.js', () => ({
  insertNotification: vi.fn(),
  findNotificationById: vi.fn(),
  findNotificationByIdForUpdate: vi.fn(),
  findNotificationByIdempotencyKey: vi.fn(),
  findNotificationsPage: vi.fn(),
  scheduleNotificationRetry: vi.fn()
}));
vi.mock('../../../src/infrastructure/db.transaction.js', () => ({
  withTransaction: vi.fn((operation) => operation(transactionClient))
}));
vi.mock('../../../src/repositories/attempt.repository.js', () => ({
  findAttemptsByNotificationId: vi.fn()
}));

import { findTemplateById } from '../../../src/repositories/template.repository.js';
import {
  findNotificationById,
  findNotificationByIdForUpdate,
  findNotificationByIdempotencyKey,
  findNotificationsPage,
  insertNotification,
  scheduleNotificationRetry
} from '../../../src/repositories/notification.repository.js';
import { findAttemptsByNotificationId } from '../../../src/repositories/attempt.repository.js';
import {
  createNotificationService,
  getNotificationService,
  listNotificationsService,
  retryBackoff,
  retryNotificationService
} from '../../../src/services/notification.service.js';

describe('notification.service.js', () => {
  const request = {
    canal: 'EMAIL',
    destinatario: 'user@example.com',
    plantillaId: 2,
    variables: { nombre: 'Ana', total: 10 }
  };
  const template = {
    id: 2,
    canal: 'EMAIL',
    variables: ['nombre', 'total']
  };
  const notification = {
    id: 9,
    ...request,
    estado: 'ENCOLADA',
    intentos: 0
  };

  beforeEach(() => {
    vi.clearAllMocks();
    findTemplateById.mockResolvedValue(template);
    insertNotification.mockResolvedValue(notification);
  });

  it('persists a valid notification and its outbox atomically', async () => {
    await expect(createNotificationService(request, 'request-1')).resolves.toEqual({
      notification,
      created: true
    });
    expect(insertNotification).toHaveBeenCalledWith({ ...request, idempotencyKey: 'request-1' });
  });

  it('returns NF001 when the template does not exist', async () => {
    findTemplateById.mockResolvedValue(undefined);
    await expect(createNotificationService(request, 'request-1')).rejects.toMatchObject({
      errorCode: 'NF001'
    });
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...template, canal: 'SMS' }, request],
    [template, { ...request, variables: { nombre: 'Ana' } }],
    [template, { ...request, variables: { nombre: 'Ana', total: 10, extra: true } }]
  ])('returns BR001 when the notification does not match the template', async (foundTemplate, input) => {
    findTemplateById.mockResolvedValue(foundTemplate);
    await expect(createNotificationService(input, 'request-1')).rejects.toMatchObject({
      errorCode: 'BR001'
    });
    expect(insertNotification).not.toHaveBeenCalled();
  });

  it('returns an identical existing notification without inserting another event', async () => {
    insertNotification.mockResolvedValue(undefined);
    findNotificationByIdempotencyKey.mockResolvedValue(notification);

    await expect(createNotificationService(request, 'request-1')).resolves.toEqual({
      notification,
      created: false
    });
  });

  it.each([
    [undefined],
    [{ ...notification, destinatario: 'other@example.com' }],
    [{ ...notification, variables: { nombre: 'Ana', total: '10' } }]
  ])('returns CF001 when an idempotency key cannot represent this request', async (existing) => {
    insertNotification.mockResolvedValue(undefined);
    findNotificationByIdempotencyKey.mockResolvedValue(existing);

    await expect(createNotificationService(request, 'request-1')).rejects.toMatchObject({
      errorCode: 'CF001'
    });
  });

  it('returns a notification with its ordered attempt history', async () => {
    const attempts = [{ id: '1', numero: 1, resultado: 'FALLIDO' }];
    findNotificationById.mockResolvedValue(notification);
    findAttemptsByNotificationId.mockResolvedValue(attempts);

    await expect(getNotificationService('9')).resolves.toEqual({
      ...notification,
      historialIntentos: attempts
    });
    expect(findAttemptsByNotificationId).toHaveBeenCalledWith('9');
  });

  it('returns an empty attempt history for an ENCOLADA notification', async () => {
    findNotificationById.mockResolvedValue(notification);
    findAttemptsByNotificationId.mockResolvedValue([]);

    await expect(getNotificationService('9')).resolves.toMatchObject({
      estado: 'ENCOLADA',
      intentos: 0,
      historialIntentos: []
    });
  });

  it('returns NF001 and does not query attempts when the notification is absent', async () => {
    findNotificationById.mockResolvedValue(undefined);

    await expect(getNotificationService('999')).rejects.toMatchObject({
      errorCode: 'NF001'
    });
    expect(findAttemptsByNotificationId).not.toHaveBeenCalled();
  });

  it('returns a filtered notification page with pagination metadata', async () => {
    const items = [notification];
    findNotificationsPage.mockResolvedValue({ items, totalItems: 21 });

    await expect(listNotificationsService({
      canal: 'EMAIL',
      estado: 'ENCOLADA',
      page: 2,
      limit: 10
    })).resolves.toEqual({
      items,
      pagination: {
        page: 2,
        limit: 10,
        totalItems: 21,
        totalPages: 3
      }
    });
    expect(findNotificationsPage).toHaveBeenCalledWith({
      canal: 'EMAIL',
      estado: 'ENCOLADA',
      limit: 10,
      offset: '10'
    });
  });

  it('keeps the total when the requested page has no items', async () => {
    findNotificationsPage.mockResolvedValue({ items: [], totalItems: 3 });

    await expect(listNotificationsService({ page: 5, limit: 2 })).resolves.toEqual({
      items: [],
      pagination: {
        page: 5,
        limit: 2,
        totalItems: 3,
        totalPages: 2
      }
    });
  });

  it('returns zero pages for an empty collection', async () => {
    findNotificationsPage.mockResolvedValue({ items: [], totalItems: 0 });

    await expect(listNotificationsService({ page: 1, limit: 20 })).resolves.toEqual({
      items: [],
      pagination: {
        page: 1,
        limit: 20,
        totalItems: 0,
        totalPages: 0
      }
    });
  });

  it.each([
    [1, 1000],
    [2, 2000],
    [4, 8000]
  ])('calculates retry backoff from persisted attempt %i', (attempts, expected) => {
    expect(retryBackoff(attempts)).toBe(expected);
  });

  it('changes a failed notification to ENCOLADA and schedules its outbox', async () => {
    const failed = { ...notification, estado: 'FALLIDA', intentos: 2 };
    const retried = { ...failed, estado: 'ENCOLADA' };
    findNotificationByIdForUpdate.mockResolvedValue(failed);
    scheduleNotificationRetry.mockResolvedValue(retried);

    await expect(retryNotificationService('9')).resolves.toEqual(retried);
    expect(findNotificationByIdForUpdate).toHaveBeenCalledWith(transactionClient, '9');
    expect(scheduleNotificationRetry).toHaveBeenCalledWith(transactionClient, '9', 2000);
  });

  it('returns NF001 when the retry target does not exist', async () => {
    findNotificationByIdForUpdate.mockResolvedValue(undefined);
    await expect(retryNotificationService('999')).rejects.toMatchObject({ errorCode: 'NF001' });
    expect(scheduleNotificationRetry).not.toHaveBeenCalled();
  });

  it.each(['ENVIADA', 'ENCOLADA'])(
    'returns CF001 when a notification is %s',
    async (estado) => {
      findNotificationByIdForUpdate.mockResolvedValue({ ...notification, estado, intentos: 1 });
      await expect(retryNotificationService('9')).rejects.toMatchObject({ errorCode: 'CF001' });
      expect(scheduleNotificationRetry).not.toHaveBeenCalled();
    }
  );

  it('returns CF001 when the maximum persisted attempts was reached', async () => {
    findNotificationByIdForUpdate.mockResolvedValue({
      ...notification, estado: 'FALLIDA', intentos: 5
    });
    await expect(retryNotificationService('9')).rejects.toMatchObject({ errorCode: 'CF001' });
    expect(scheduleNotificationRetry).not.toHaveBeenCalled();
  });
});
