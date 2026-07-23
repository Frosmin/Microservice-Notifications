import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tigo/postgres-connector', () => ({ executeQuery: vi.fn() }));
const client = { query: vi.fn() };
vi.mock('../../../src/infrastructure/db.transaction.js', () => ({
  withTransaction: vi.fn((operation) => operation(client))
}));

import { executeQuery } from '@tigo/postgres-connector';
import {
  findNotificationById,
  findNotificationByIdForUpdate,
  findNotificationByIdempotencyKey,
  findNotificationsPage,
  insertNotification,
  scheduleNotificationRetry
} from '../../../src/repositories/notification.repository.js';

describe('notification.repository.js', () => {
  beforeEach(() => vi.clearAllMocks());

  const input = {
    canal: 'EMAIL',
    destinatario: 'user@example.com',
    plantillaId: 2,
    variables: { nombre: 'Ana' },
    idempotencyKey: 'request-1'
  };

  it('inserts an ENCOLADA notification atomically by idempotency key', async () => {
    const row = { id: 10, ...input, estado: 'ENCOLADA', intentos: 0 };
    client.query
      .mockResolvedValueOnce({ rows: [row] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(insertNotification(input)).resolves.toEqual(row);
    const [query, params] = client.query.mock.calls[0];
    expect(query).toMatch(/ON CONFLICT \(idempotency_key\) DO NOTHING/);
    expect(query).toMatch(/plantilla_id AS "plantillaId"/);
    expect(params).toEqual(['EMAIL', 'user@example.com', 2, '{"nombre":"Ana"}', 'request-1']);
    expect(client.query.mock.calls[1][0]).toMatch(/INSERT INTO notification_outbox/);
    expect(client.query.mock.calls[1][1]).toEqual([10]);
  });

  it('returns undefined on an idempotency conflict without another outbox event', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await expect(insertNotification(input)).resolves.toBeUndefined();
    expect(client.query).toHaveBeenCalledOnce();
  });

  it('finds the existing notification by idempotency key', async () => {
    executeQuery.mockResolvedValue([{ id: 10 }]);
    await expect(findNotificationByIdempotencyKey('request-1')).resolves.toEqual({ id: 10 });
    expect(executeQuery.mock.calls[0][1]).toEqual(['request-1']);
  });

  it('finds a notification by id using a bigint parameter', async () => {
    executeQuery.mockResolvedValue([{ id: '10', estado: 'ENCOLADA' }]);
    await expect(findNotificationById('10')).resolves.toEqual({
      id: '10',
      estado: 'ENCOLADA'
    });
    expect(executeQuery.mock.calls[0][0]).toMatch(/WHERE id = \$1::bigint/);
    expect(executeQuery.mock.calls[0][1]).toEqual(['10']);
  });

  it('locks a notification row before evaluating a manual retry', async () => {
    client.query.mockResolvedValue({ rows: [{ id: '10', estado: 'FALLIDA', intentos: 2 }] });
    await expect(findNotificationByIdForUpdate(client, '10')).resolves.toMatchObject({
      id: '10', estado: 'FALLIDA'
    });
    expect(client.query.mock.calls[0][0]).toMatch(/FOR UPDATE/);
    expect(client.query.mock.calls[0][1]).toEqual(['10']);
  });

  it('updates state and creates a delayed outbox event without resetting attempts', async () => {
    const updated = { id: '10', estado: 'ENCOLADA', intentos: 2 };
    client.query
      .mockResolvedValueOnce({ rows: [updated] })
      .mockResolvedValueOnce({ rows: [] });

    await expect(scheduleNotificationRetry(client, '10', 2000)).resolves.toEqual(updated);
    expect(client.query.mock.calls[0][0]).toMatch(/SET estado = 'ENCOLADA'/);
    expect(client.query.mock.calls[0][0]).not.toMatch(/intentos\s*=/);
    expect(client.query.mock.calls[1][0]).toMatch(/INSERT INTO notification_outbox/);
    expect(client.query.mock.calls[1][0]).toMatch(/INTERVAL '1 millisecond'/);
    expect(client.query.mock.calls[1][1]).toEqual(['10', 2000]);
  });

  it('propagates an outbox failure so the surrounding transaction rolls back', async () => {
    client.query
      .mockResolvedValueOnce({ rows: [{ id: '10', estado: 'ENCOLADA' }] })
      .mockRejectedValueOnce(new Error('outbox failed'));
    await expect(scheduleNotificationRetry(client, '10', 1000)).rejects.toThrow('outbox failed');
  });

  it('returns a filtered page with its total count', async () => {
    const items = [
      { id: '10', canal: 'EMAIL', estado: 'FALLIDA' },
      { id: '9', canal: 'EMAIL', estado: 'FALLIDA' }
    ];
    executeQuery
      .mockResolvedValueOnce([{ totalItems: '5' }])
      .mockResolvedValueOnce(items);

    await expect(findNotificationsPage({
      canal: 'EMAIL',
      estado: 'FALLIDA',
      limit: 2,
      offset: '2'
    })).resolves.toEqual({ items, totalItems: 5 });

    const [countQuery, countParams] = executeQuery.mock.calls[0];
    const [pageQuery, pageParams] = executeQuery.mock.calls[1];
    expect(countQuery).toMatch(/COUNT\(\*\) AS "totalItems"/);
    expect(countQuery).toMatch(/\$1::varchar IS NULL OR canal = \$1::varchar/);
    expect(countQuery).toMatch(/\$2::varchar IS NULL OR estado = \$2::varchar/);
    expect(countParams).toEqual(['EMAIL', 'FALLIDA']);
    expect(pageQuery).toMatch(/ORDER BY created_at DESC, id DESC/);
    expect(pageQuery).toMatch(/LIMIT \$3::integer/);
    expect(pageQuery).toMatch(/OFFSET \$4::bigint/);
    expect(pageParams).toEqual(['EMAIL', 'FALLIDA', 2, '2']);
  });

  it('uses null parameters when filters are absent', async () => {
    executeQuery
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(findNotificationsPage({
      limit: 20,
      offset: '0'
    })).resolves.toEqual({ items: [], totalItems: 0 });

    expect(executeQuery.mock.calls[0][1]).toEqual([null, null]);
    expect(executeQuery.mock.calls[1][1]).toEqual([null, null, 20, '0']);
  });
});
