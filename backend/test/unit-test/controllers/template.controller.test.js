import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/services/template.service.js', () => ({
  createTemplateService: vi.fn(),
  deleteTemplateService: vi.fn(),
  updateTemplateService: vi.fn()
}));

import {
  createTemplateService,
  deleteTemplateService,
  updateTemplateService
} from '../../../src/services/template.service.js';
import {
  createTemplateController,
  deleteTemplateController,
  updateTemplateController
} from '../../../src/controllers/template.controller.js';
import { errorCodes, setError } from '../../../src/utils/errorCodes.js';

describe('template.controller.js', () => {
  const req = {
    params: { id: '8' },
    body: {
      nombre: 'confirmacion-pedido',
      canal: 'EMAIL',
      contenido: 'Hola {{nombre}}',
      variables: ['nombre']
    }
  };
  let res;

  beforeEach(() => {
    vi.clearAllMocks();
    res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn()
    };
  });

  it('returns 201 with the created template', async () => {
    const created = { id: 1, ...req.body };
    createTemplateService.mockResolvedValue(created);

    await createTemplateController(req, res);

    expect(createTemplateService).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(created);
  });

  it('returns 409 when the template name and channel already exist', async () => {
    createTemplateService.mockRejectedValue(
      setError('Template already exists', errorCodes.RESOURCE_CONFLICT)
    );

    await createTemplateController(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: errorCodes.RESOURCE_CONFLICT, message: 'Resource conflict' }
    });
  });

  it('returns 500 for an unexpected error', async () => {
    createTemplateService.mockRejectedValue(new Error('database unavailable'));

    await createTemplateController(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: errorCodes.GENERIC_INTERNAL_SERVER_ERROR,
        message: 'Generic internal server error'
      }
    });
  });

  it('returns 200 with the updated template', async () => {
    const updated = { id: 8, ...req.body };
    updateTemplateService.mockResolvedValue(updated);

    await updateTemplateController(req, res);

    expect(updateTemplateService).toHaveBeenCalledWith('8', req.body);
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(updated);
  });

  it.each([
    [errorCodes.NOT_FOUND, 404],
    [errorCodes.RESOURCE_CONFLICT, 409]
  ])('maps update error %s to HTTP %i', async (errorCode, status) => {
    updateTemplateService.mockRejectedValue(setError('expected', errorCode));

    await updateTemplateController(req, res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: errorCode })
    });
  });

  it('returns 204 without a body after deleting a template', async () => {
    deleteTemplateService.mockResolvedValue(undefined);

    await deleteTemplateController(req, res);

    expect(deleteTemplateService).toHaveBeenCalledWith('8');
    expect(res.status).toHaveBeenCalledWith(204);
    expect(res.send).toHaveBeenCalledWith();
    expect(res.json).not.toHaveBeenCalled();
  });

  it.each([
    [errorCodes.NOT_FOUND, 404],
    [errorCodes.RESOURCE_CONFLICT, 409]
  ])('maps delete error %s to HTTP %i', async (errorCode, status) => {
    deleteTemplateService.mockRejectedValue(setError('expected', errorCode));

    await deleteTemplateController(req, res);

    expect(res.status).toHaveBeenCalledWith(status);
    expect(res.json).toHaveBeenCalledWith({
      error: expect.objectContaining({ code: errorCode })
    });
  });

  it.each([
    ['update', updateTemplateController, updateTemplateService],
    ['delete', deleteTemplateController, deleteTemplateService]
  ])('returns 500 for an unexpected %s error', async (_operation, controller, service) => {
    service.mockRejectedValue(new Error('database unavailable'));

    await controller(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: errorCodes.GENERIC_INTERNAL_SERVER_ERROR,
        message: 'Generic internal server error'
      }
    });
  });
});
