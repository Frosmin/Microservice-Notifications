import { describe, expect, it, vi } from 'vitest';
import { createApiKeyMiddleware } from '../../../src/middleware/api-key.middleware.js';

const createResponse = () => {
  const res = {
    json: vi.fn(),
    setHeader: vi.fn(),
    status: vi.fn()
  };
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};

describe('API key middleware', () => {
  const configuredApiKey = 'test-secret-key-with-at-least-32-characters';

  it('accepts a valid API key', () => {
    const middleware = createApiKeyMiddleware({ apiKey: configuredApiKey });
    const next = vi.fn();
    const res = createResponse();

    middleware({ path: '/notifications', get: () => configuredApiKey }, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([undefined, '', 'invalid-key'])('rejects a missing or invalid API key', (apiKey) => {
    const middleware = createApiKeyMiddleware({ apiKey: configuredApiKey });
    const next = vi.fn();
    const res = createResponse();

    middleware({ path: '/notifications', get: () => apiKey }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'WWW-Authenticate',
      'ApiKey realm="notifications"'
    );
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'AU001', message: 'Unauthorized' }
    });
  });

  it('allows the health endpoint without credentials', () => {
    const middleware = createApiKeyMiddleware({ apiKey: configuredApiKey });
    const next = vi.fn();

    middleware({ path: '/health' }, createResponse(), next);

    expect(next).toHaveBeenCalledOnce();
  });

  it.each([undefined, '', 'too-short'])('fails closed when the server API key is weak or absent', (apiKey) => {
    const middleware = createApiKeyMiddleware({ apiKey });
    const next = vi.fn();
    const res = createResponse();

    middleware({ path: '/notifications', get: () => 'any-key' }, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'SU001', message: 'Service temporarily unavailable' }
    });
  });
});
