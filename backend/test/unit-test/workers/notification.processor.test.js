import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireNotificationLock: vi.fn(),
  releaseNotificationLock: vi.fn(),
  findNotificationForDelivery: vi.fn(),
  markNotificationFailed: vi.fn(),
  recordDeliveryAttempt: vi.fn()
}));
vi.mock('../../../src/infrastructure/db.transaction.js', () => ({
  withConnection: vi.fn((operation) => operation({ query: vi.fn() }))
}));
vi.mock('../../../src/repositories/delivery.repository.js', () => mocks);

import { PermanentDeliveryError } from '../../../src/providers/delivery.errors.js';
import { createNotificationProcessor } from '../../../src/workers/notification.processor.js';

describe('notification.processor.js', () => {
  const emailSender = vi.fn();
  const smsSender = vi.fn();
  const notification = {
    notificationId: '9',
    canal: 'EMAIL',
    destinatario: 'ana@example.com',
    variables: { nombre: 'Ana' },
    estado: 'ENCOLADA',
    intentos: 0,
    templateName: 'Saludo',
    templateContent: 'Hola {{nombre}}'
  };
  const job = { data: { notificationId: '9' } };
  let process;

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findNotificationForDelivery.mockResolvedValue(notification);
    emailSender.mockResolvedValue({ messageId: 'smtp-1' });
    smsSender.mockResolvedValue({ messageId: 'sms-1' });
    process = createNotificationProcessor({ emailSender, smsSender, maxAttempts: 5 });
  });

  it('renders, sends email and atomically records success', async () => {
    await expect(process(job)).resolves.toEqual({ sent: true });
    expect(emailSender).toHaveBeenCalledWith({
      notificationId: '9', to: 'ana@example.com', subject: 'Saludo', message: 'Hola Ana'
    });
    expect(mocks.recordDeliveryAttempt).toHaveBeenCalledWith(expect.anything(), {
      notificationId: '9', resultado: 'EXITOSO', detalle: 'smtp-1', estado: 'ENVIADA'
    });
    expect(mocks.releaseNotificationLock).toHaveBeenCalled();
  });

  it('routes SMS through its independent adapter', async () => {
    mocks.findNotificationForDelivery.mockResolvedValue({ ...notification, canal: 'SMS' });
    await process(job);
    expect(smsSender).toHaveBeenCalledOnce();
    expect(emailSender).not.toHaveBeenCalled();
  });

  it('never calls a provider for an already delivered notification', async () => {
    mocks.findNotificationForDelivery.mockResolvedValue({ ...notification, estado: 'ENVIADA' });
    await expect(process(job)).resolves.toEqual({ skipped: true, reason: 'already-sent' });
    expect(emailSender).not.toHaveBeenCalled();
    expect(mocks.recordDeliveryAttempt).not.toHaveBeenCalled();
  });

  it('records a transient failure and throws so BullMQ retries it', async () => {
    emailSender.mockRejectedValue(new Error('SMTP 421'));
    await expect(process(job)).rejects.toThrow('SMTP 421');
    expect(mocks.recordDeliveryAttempt).toHaveBeenCalledWith(expect.anything(), {
      notificationId: '9', resultado: 'FALLIDO', detalle: 'SMTP 421', estado: 'ENCOLADA'
    });
  });

  it('stops immediately on a permanent provider failure', async () => {
    emailSender.mockRejectedValue(new PermanentDeliveryError('bad recipient'));
    await expect(process(job)).rejects.toMatchObject({ name: 'UnrecoverableError' });
    expect(mocks.recordDeliveryAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      resultado: 'FALLIDO', estado: 'FALLIDA'
    }));
  });

  it('marks the fifth persisted attempt terminal', async () => {
    mocks.findNotificationForDelivery.mockResolvedValue({ ...notification, intentos: 4 });
    emailSender.mockRejectedValue(new Error('timeout'));
    await expect(process(job)).rejects.toMatchObject({ name: 'UnrecoverableError' });
    expect(mocks.recordDeliveryAttempt).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      estado: 'FALLIDA'
    }));
  });

  it.each([
    [undefined, 'does not exist'],
    [{ ...notification, estado: 'FALLIDA' }, 'exhausted'],
    [{ ...notification, intentos: 5 }, 'exhausted']
  ])('stops without sending when current database state is terminal', async (current, message) => {
    mocks.findNotificationForDelivery.mockResolvedValue(current);
    await expect(process(job)).rejects.toThrow(message);
    expect(emailSender).not.toHaveBeenCalled();
  });

  it('treats missing rendered values and unsupported channels as terminal', async () => {
    mocks.findNotificationForDelivery.mockResolvedValue({ ...notification, variables: {} });
    await expect(process(job)).rejects.toMatchObject({ name: 'UnrecoverableError' });
    mocks.findNotificationForDelivery.mockResolvedValue({ ...notification, canal: 'PUSH' });
    await expect(process(job)).rejects.toMatchObject({ name: 'UnrecoverableError' });
  });
});
