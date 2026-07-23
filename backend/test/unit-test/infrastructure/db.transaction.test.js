import { beforeEach, describe, expect, it, vi } from 'vitest';

const { client, getDB } = vi.hoisted(() => {
  const dbClient = { query: vi.fn(), release: vi.fn() };
  return {
    client: dbClient,
    getDB: vi.fn(() => ({ getConnection: vi.fn().mockResolvedValue(dbClient) }))
  };
});
vi.mock('@tigo/postgres-connector', () => ({ getDB }));

import { withConnection, withTransaction } from '../../../src/infrastructure/db.transaction.js';

describe('db.transaction.js', () => {
  beforeEach(() => vi.clearAllMocks());

  it('always releases a borrowed connection', async () => {
    await expect(withConnection(async (borrowed) => borrowed)).resolves.toBe(client);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('commits successful work', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await expect(withTransaction(async () => 'done')).resolves.toBe('done');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('rolls back failed work and releases the connection', async () => {
    client.query.mockResolvedValue({ rows: [] });
    await expect(withTransaction(async () => {
      throw new Error('failed');
    })).rejects.toThrow('failed');
    expect(client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'ROLLBACK']);
    expect(client.release).toHaveBeenCalledOnce();
  });
});
