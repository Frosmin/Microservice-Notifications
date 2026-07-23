import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  lockNextOutboxEvent,
  markOutboxPublicationFailed,
  markOutboxPublished
} from '../../../src/repositories/outbox.repository.js';

describe('outbox.repository.js', () => {
  const client = { query: vi.fn() };
  beforeEach(() => vi.clearAllMocks());

  it('claims one available event without blocking another publisher', async () => {
    client.query.mockResolvedValue({ rows: [{ id: '1', notificationId: '9' }] });
    await expect(lockNextOutboxEvent(client)).resolves.toMatchObject({ id: '1' });
    expect(client.query.mock.calls[0][0]).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(client.query.mock.calls[0][0]).toMatch(/available_at <= NOW\(\)/);
  });

  it('marks an event published', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await markOutboxPublished(client, '1');
    expect(client.query.mock.calls[0][0]).toMatch(/published_at = NOW\(\)/);
    expect(client.query.mock.calls[0][1]).toEqual(['1']);
  });

  it('persists publication error and schedules a later retry', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await markOutboxPublicationFailed(client, '1', 'redis down', 4000);
    expect(client.query.mock.calls[0][0]).toMatch(/publish_attempts = publish_attempts \+ 1/);
    expect(client.query.mock.calls[0][0]).toMatch(/INTERVAL '1 millisecond'/);
    expect(client.query.mock.calls[0][1]).toEqual(['1', 4000, 'redis down']);
  });
});
