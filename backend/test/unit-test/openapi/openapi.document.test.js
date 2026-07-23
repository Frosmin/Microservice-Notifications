import SwaggerParser from '@apidevtools/swagger-parser';
import { describe, expect, it } from 'vitest';
import openapiDocument from '../../../src/openapi/openapi.document.js';

const documentedOperations = () => Object.entries(openapiDocument.paths)
  .flatMap(([path, pathItem]) => (
    ['get', 'post', 'put', 'patch', 'delete']
      .filter((method) => pathItem[method])
      .map((method) => `${method.toUpperCase()} ${path}`)
  ));

describe('OpenAPI document', () => {
  it('is a valid OpenAPI 3.1 contract', async () => {
    await expect(
      SwaggerParser.validate(structuredClone(openapiDocument))
    ).resolves.toBeDefined();
  });

  it('documents every application and observability operation', () => {
    expect(documentedOperations().sort()).toEqual([
      'DELETE /templates/{id}',
      'GET /health',
      'GET /metrics',
      'GET /notifications',
      'GET /notifications/{id}',
      'POST /notifications',
      'POST /notifications/{id}/retry',
      'POST /templates',
      'PUT /templates/{id}'
    ].sort());
  });

  it('documents idempotency, pagination and standard errors', () => {
    const createNotification = openapiDocument.paths['/notifications'].post;
    const listNotifications = openapiDocument.paths['/notifications'].get;

    expect(createNotification.parameters).toContainEqual({
      $ref: '#/components/parameters/IdempotencyKey'
    });
    expect(listNotifications.parameters).toEqual(expect.arrayContaining([
      { $ref: '#/components/parameters/Page' },
      { $ref: '#/components/parameters/Limit' }
    ]));
    expect(openapiDocument.components.responses).toEqual(expect.objectContaining({
      BadRequest: expect.any(Object),
      Conflict: expect.any(Object),
      InternalServerError: expect.any(Object),
      NotFound: expect.any(Object),
      Unauthorized: expect.any(Object)
    }));
  });

  it('requires an API key except for health and metrics', () => {
    expect(openapiDocument.security).toEqual([{ ApiKeyAuth: [] }]);
    expect(openapiDocument.components.securitySchemes.ApiKeyAuth).toMatchObject({
      type: 'apiKey',
      in: 'header',
      name: 'X-API-Key'
    });
    expect(openapiDocument.paths['/health'].get.security).toEqual([]);
    expect(openapiDocument.paths['/metrics'].get.security).toEqual([]);
  });

  it('publishes metrics outside the versioned API base path', () => {
    expect(openapiDocument.paths['/metrics'].servers).toEqual([
      { url: '/', description: 'Raiz del proceso HTTP' }
    ]);
  });
});
