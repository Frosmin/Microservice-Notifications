import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/repositories/template.repository.js', () => ({
  deleteTemplateById: vi.fn(),
  findTemplateById: vi.fn(),
  insertTemplate: vi.fn(),
  updateTemplateById: vi.fn()
}));

import {
  deleteTemplateById,
  findTemplateById,
  insertTemplate,
  updateTemplateById
} from '../../../src/repositories/template.repository.js';
import {
  createTemplateService,
  deleteTemplateService,
  updateTemplateService
} from '../../../src/services/template.service.js';

describe('template.service.js', () => {
  const template = {
    nombre: 'confirmacion-pedido',
    canal: 'EMAIL',
    contenido: 'Hola {{nombre}}',
    variables: ['nombre']
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the template created by the repository', async () => {
    const created = { id: 1, ...template };
    insertTemplate.mockResolvedValue(created);

    await expect(createTemplateService(template)).resolves.toEqual(created);
    expect(insertTemplate).toHaveBeenCalledWith(template);
  });

  it('throws CF001 when the name and channel already exist', async () => {
    insertTemplate.mockResolvedValue(undefined);

    await expect(createTemplateService(template)).rejects.toMatchObject({
      errorCode: 'CF001'
    });
  });

  it('returns the updated template', async () => {
    const updated = { id: 8, ...template };
    updateTemplateById.mockResolvedValue(updated);

    await expect(updateTemplateService('8', template)).resolves.toEqual(updated);
    expect(updateTemplateById).toHaveBeenCalledWith('8', template);
    expect(findTemplateById).not.toHaveBeenCalled();
  });

  it('throws NF001 when updating a missing template', async () => {
    updateTemplateById.mockResolvedValue(undefined);
    findTemplateById.mockResolvedValue(undefined);

    await expect(updateTemplateService('8', template)).rejects.toMatchObject({
      errorCode: 'NF001'
    });
  });

  it('throws CF001 when update conflicts with another name and channel', async () => {
    updateTemplateById.mockResolvedValue(undefined);
    findTemplateById.mockResolvedValue({ id: 8, ...template });

    await expect(updateTemplateService('8', template)).rejects.toMatchObject({
      errorCode: 'CF001'
    });
  });

  it('deletes a template without associated notifications', async () => {
    deleteTemplateById.mockResolvedValue({ id: 8, ...template });

    await expect(deleteTemplateService('8')).resolves.toBeUndefined();
    expect(findTemplateById).not.toHaveBeenCalled();
  });

  it('throws NF001 when deleting a missing template', async () => {
    deleteTemplateById.mockResolvedValue(undefined);
    findTemplateById.mockResolvedValue(undefined);

    await expect(deleteTemplateService('8')).rejects.toMatchObject({
      errorCode: 'NF001'
    });
  });

  it('throws CF001 when deleting a template with notifications', async () => {
    deleteTemplateById.mockResolvedValue(undefined);
    findTemplateById.mockResolvedValue({ id: 8, ...template });

    await expect(deleteTemplateService('8')).rejects.toMatchObject({
      errorCode: 'CF001'
    });
  });
});
