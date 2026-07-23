import { describe, expect, it, vi } from 'vitest';
import { validateRequestMiddleware } from '../../../src/middleware/validate.middleware.js';

const validBody = {
  nombre: ' confirmacion-pedido ',
  canal: 'EMAIL',
  contenido: 'Hola {{nombre}}',
  variables: [' nombre ', 'pedidoId']
};

const createResponse = () => ({
  status: vi.fn().mockReturnThis(),
  json: vi.fn()
});

describe('validate.middleware.js', () => {
  it('calls next and stores normalized data for a valid template', () => {
    const req = { body: { ...validBody }, params: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.createTemplate()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body.nombre).toBe('confirmacion-pedido');
    expect(req.body.variables).toEqual(['nombre', 'pedidoId']);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...validBody, canal: 'WHATSAPP' }],
    [{ ...validBody, nombre: '   ' }],
    [{ ...validBody, contenido: '   ' }],
    [{ ...validBody, variables: ['nombre', ' nombre '] }],
    [{ ...validBody, extra: true }]
  ])('returns 400 for an invalid body', (body) => {
    const req = { body, params: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.createTemplate()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'BR001', message: 'Missing required parameter' }
    });
  });

  it('accepts a template without variables', () => {
    const req = { body: { ...validBody, variables: [] }, params: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.createTemplate()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it('validates and normalizes the complete update body', () => {
    const req = { body: { ...validBody }, params: { id: '8' } };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.updateTemplate()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.body.nombre).toBe('confirmacion-pedido');
    expect(req.body.variables).toEqual(['nombre', 'pedidoId']);
  });

  it('rejects a partial update body', () => {
    const req = { body: { nombre: 'nuevo-nombre' }, params: { id: '8' } };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.updateTemplate()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each(['1', '9223372036854775807'])('accepts template bigint id %s', (id) => {
    const req = { params: { id }, body: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.templateId()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.params).toEqual({ id });
  });

  it.each(['0', '-1', '1.5', 'abc', '9223372036854775808'])(
    'rejects invalid template id %s',
    (id) => {
      const req = { params: { id }, body: {} };
      const res = createResponse();
      const next = vi.fn();

      validateRequestMiddleware.templateId()(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    }
  );

  it.each([
    ['EMAIL', 'user@example.com'],
    ['SMS', '+59170000000']
  ])('accepts a valid %s notification and normalizes the header', (canal, destinatario) => {
    const req = {
      body: { canal, destinatario, plantillaId: 1, variables: { nombre: 'Ana', activo: true, total: 10 } },
      get: vi.fn(() => ' request-1 '),
      params: {}
    };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.createNotification()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.idempotencyKey).toBe('request-1');
  });

  it.each([
    [{ canal: 'EMAIL', destinatario: 'invalid', plantillaId: 1, variables: {} }, 'key'],
    [{ canal: 'SMS', destinatario: '70000000', plantillaId: 1, variables: {} }, 'key'],
    [{ canal: 'EMAIL', destinatario: 'a@b.com', plantillaId: 1, variables: { nested: {} } }, 'key'],
    [{ canal: 'EMAIL', destinatario: 'a@b.com', plantillaId: 1, variables: { nil: null } }, 'key'],
    [{ canal: 'EMAIL', destinatario: 'a@b.com', plantillaId: 1, variables: {}, extra: true }, 'key'],
    [{ canal: 'EMAIL', destinatario: 'a@b.com', plantillaId: 1, variables: {} }, undefined]
  ])('rejects an invalid notification contract', (body, header) => {
    const req = { body, get: vi.fn(() => header), params: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.createNotification()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each(['1', '9223372036854775807'])('accepts PostgreSQL bigint id %s', (id) => {
    const req = { params: { id }, body: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.getNotification()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.params).toEqual({ id });
  });

  it.each(['0', '-1', '1.5', 'abc', '9223372036854775808'])('rejects invalid id %s', (id) => {
    const req = { params: { id }, body: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.getNotification()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it.each(['1', '9223372036854775807'])('accepts retry bigint id %s', (id) => {
    const req = { params: { id }, body: {} };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.retryNotification()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.params).toEqual({ id });
  });

  it.each(['0', '-1', '1.5', 'abc', '9223372036854775808'])(
    'rejects invalid retry id %s',
    (id) => {
      const req = { params: { id }, body: {} };
      const res = createResponse();
      const next = vi.fn();

      validateRequestMiddleware.retryNotification()(req, res, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
    }
  );

  it('applies default notification pagination', () => {
    const req = {};
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.listNotifications()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.query).toEqual({ page: 1, limit: 20 });
  });

  it.each([
    [{ canal: 'EMAIL' }, { canal: 'EMAIL', page: 1, limit: 20 }],
    [{ estado: 'FALLIDA' }, { estado: 'FALLIDA', page: 1, limit: 20 }],
    [
      { canal: 'SMS', estado: 'ENVIADA', page: '2', limit: '50' },
      { canal: 'SMS', estado: 'ENVIADA', page: 2, limit: 50 }
    ]
  ])('accepts and normalizes notification query %#', (query, expected) => {
    const req = { query };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.listNotifications()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(req.query).toEqual(expected);
  });

  it.each([
    [{ canal: 'email' }],
    [{ canal: 'WHATSAPP' }],
    [{ estado: 'PROCESANDO' }],
    [{ page: '0' }],
    [{ page: '-1' }],
    [{ page: '1.5' }],
    [{ page: 'abc' }],
    [{ limit: '0' }],
    [{ limit: '101' }],
    [{ limit: '1.5' }],
    [{ pageSize: '20' }]
  ])('rejects invalid notification query %#', (query) => {
    const req = { query };
    const res = createResponse();
    const next = vi.fn();

    validateRequestMiddleware.listNotifications()(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'BR001', message: 'Missing required parameter' }
    });
  });
});
