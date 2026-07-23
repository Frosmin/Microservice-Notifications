import { describe, expect, it, vi } from 'vitest';

vi.mock('@tigo/postgres-connector', () => ({ executeQuery: vi.fn() }));

import { executeQuery } from '@tigo/postgres-connector';
import { findAttemptsByNotificationId } from '../../../src/repositories/attempt.repository.js';

describe('attempt.repository.js', () => {
  it('returns attempts ordered by their sequence number', async () => {
    const attempts = [
      {
        id: '1',
        notificationId: '10',
        numero: 1,
        resultado: 'FALLIDO',
        detalle: 'timeout'
      }
    ];
    executeQuery.mockResolvedValue(attempts);

    await expect(findAttemptsByNotificationId('10')).resolves.toEqual(attempts);
    const [query, params] = executeQuery.mock.calls[0];
    expect(query).toMatch(/notificacion_id AS "notificationId"/);
    expect(query).toMatch(/ORDER BY numero ASC/);
    expect(params).toEqual(['10']);
  });
});
