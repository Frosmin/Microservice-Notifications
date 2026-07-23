import 'dotenv/config';
import { describe, it, expect, vi } from 'vitest';

const { mockApp } = vi.hoisted(() => ({
  mockApp: { get: vi.fn(), use: vi.fn(), disable: vi.fn(), listen: vi.fn() }
}));

vi.mock('ultimate-express', () => ({ default: vi.fn(() => mockApp) }));
vi.mock('express-prom-bundle', () => ({ default: vi.fn(() => 'promBundleMiddleware') }));
vi.mock('helmet', () => {
  const helmetMock = vi.fn(() => 'helmetMiddleware');
  helmetMock.noSniff = vi.fn(() => 'noSniffMiddleware');
  helmetMock.contentSecurityPolicy = vi.fn(() => 'cspMiddleware');
  return { default: helmetMock };
});
vi.mock('body-parser', () => ({ default: { json: vi.fn(() => 'jsonMiddleware') } }));
vi.mock('swagger-ui-express', () => ({
  default: {
    serve: ['swaggerUiStatic'],
    setup: vi.fn(() => 'swaggerUiSetup')
  }
}));
vi.mock('@tigo/logger', () => ({ httpLoggerMiddleware: vi.fn(() => 'httpLoggerMiddleware') }));
vi.mock('../../src/openapi/openapi.document.js', () => ({
  default: { openapi: '3.1.0' }
}));
vi.mock('../../src/routes/router.routes.js', () => ({ default: 'routerRoutes' }));
vi.mock('../../src/middleware/api-key.middleware.js', () => ({
  apiKeyMiddleware: 'apiKeyMiddleware'
}));
vi.mock('../../src/utils/config.js', () => ({
  default: { API_BASE_PATH: '/api/v1', SERVICE_API_KEY: 'test-secret-key' }
}));

import '../../src/app.js';
import ultimateExpress from 'ultimate-express';
import config from '../../src/utils/config.js';

describe('app.js', () => {
  it('should initialize the app and mount the router on the base path', () => {
    expect(ultimateExpress).toHaveBeenCalled();
    expect(mockApp.use).toHaveBeenCalledWith(
      config.API_BASE_PATH,
      'apiKeyMiddleware'
    );
    expect(mockApp.use).toHaveBeenCalledWith(
      config.API_BASE_PATH,
      'routerRoutes'
    );
  });

  it('publishes the OpenAPI contract and Swagger UI', () => {
    expect(mockApp.get).toHaveBeenCalledWith('/openapi.json', expect.any(Function));
    expect(mockApp.use).toHaveBeenCalledWith(
      '/docs',
      'cspMiddleware',
      'swaggerUiStatic',
      'swaggerUiSetup'
    );
  });
});
