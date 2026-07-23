import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  acquireNotificationLock,
  findNotificationForDelivery,
  markNotificationFailed,
  recordDeliveryAttempt,
  releaseNotificationLock
} from '../../../src/repositories/delivery.repository.js';

describe('delivery.repository.js', () => {
  const client = { query: vi.fn() };
  beforeEach(() => vi.clearAllMocks());

  it('acquires and releases a session advisory lock by notification', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await acquireNotificationLock(client, '8');
    await releaseNotificationLock(client, '8');
    expect(client.query.mock.calls[0]).toEqual([
      'SELECT pg_advisory_lock($1::bigint);', ['8']
    ]);
    expect(client.query.mock.calls[1][0]).toMatch(/pg_advisory_unlock/);
  });

  it('reloads notification and template from PostgreSQL', async () => {
    client.query.mockResolvedValue({ rows: [{ notificationId: '8' }] });
    await expect(findNotificationForDelivery(client, '8')).resolves.toEqual({ notificationId: '8' });
    expect(client.query.mock.calls[0][0]).toMatch(/JOIN plantilla/);
    expect(client.query.mock.calls[0][1]).toEqual(['8']);
  });

  it('increments the counter and inserts the matching attempt atomically', async () => {
    client.query.mockResolvedValue({ rows: [{ numero: 2 }] });
    await expect(recordDeliveryAttempt(client, {
      notificationId: '8', resultado: 'FALLIDO', detalle: 'timeout', estado: 'ENCOLADA'
    })).resolves.toEqual({ numero: 2 });
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/WITH updated_notification/);
    expect(sql).toMatch(/SET intentos = intentos \+ 1/);
    expect(sql).toMatch(/INSERT INTO intento/);
    expect(params).toEqual(['8', 'FALLIDO', 'timeout', 'ENCOLADA']);
  });

  it('marks only unsent notifications as failed', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await markNotificationFailed(client, '8');
    expect(client.query.mock.calls[0][0]).toMatch(/estado <> 'ENVIADA'/);
  });
});
