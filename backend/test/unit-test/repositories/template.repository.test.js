import { describe, expect, it, vi } from 'vitest';

vi.mock('@tigo/postgres-connector', () => ({
  executeQuery: vi.fn()
}));

import { executeQuery } from '@tigo/postgres-connector';
import {
  deleteTemplateById,
  findTemplateById,
  insertTemplate,
  updateTemplateById
} from '../../../src/repositories/template.repository.js';

describe('template.repository.js', () => {
  const template = {
    nombre: 'confirmacion-pedido',
    canal: 'EMAIL',
    contenido: 'Hola {{nombre}}',
    variables: ['nombre']
  };

  it('uses a parameterized atomic insert and returns the created row', async () => {
    const row = { id: 1, ...template };
    executeQuery.mockResolvedValue([row]);

    const result = await insertTemplate(template);

    const [query, params] = executeQuery.mock.calls[0];
    expect(query).toMatch(/INSERT INTO plantilla/);
    expect(query).toMatch(/ON CONFLICT \(nombre, canal\) DO NOTHING/);
    expect(query).toMatch(/RETURNING id, nombre, canal, contenido, variables/);
    expect(params).toEqual([
      template.nombre,
      template.canal,
      template.contenido,
      template.variables
    ]);
    expect(result).toEqual(row);
  });

  it('returns undefined when PostgreSQL ignores a duplicate', async () => {
    executeQuery.mockResolvedValue([]);

    await expect(insertTemplate(template)).resolves.toBeUndefined();
  });

  it('finds a template by its identifier', async () => {
    executeQuery.mockResolvedValue([{ id: 8, ...template }]);

    await expect(findTemplateById(8)).resolves.toEqual({ id: 8, ...template });
    expect(executeQuery.mock.calls.at(-1)[0]).toMatch(/WHERE id = \$1::bigint/);
    expect(executeQuery.mock.calls.at(-1)[1]).toEqual([8]);
  });

  it('updates a template atomically when name and channel are available', async () => {
    const row = { id: 8, ...template };
    executeQuery.mockResolvedValue([row]);

    await expect(updateTemplateById('8', template)).resolves.toEqual(row);

    const [query, params] = executeQuery.mock.calls.at(-1);
    expect(query).toMatch(/UPDATE plantilla AS target/);
    expect(query).toMatch(/updated_at = CURRENT_TIMESTAMP/);
    expect(query).toMatch(/NOT EXISTS/);
    expect(query).toMatch(/duplicate\.id <> \$1::bigint/);
    expect(params).toEqual([
      '8',
      template.nombre,
      template.canal,
      template.contenido,
      template.variables
    ]);
  });

  it('returns undefined when a template cannot be updated', async () => {
    executeQuery.mockResolvedValue([]);

    await expect(updateTemplateById('8', template)).resolves.toBeUndefined();
  });

  it('deletes only templates without associated notifications', async () => {
    const row = { id: 8, ...template };
    executeQuery.mockResolvedValue([row]);

    await expect(deleteTemplateById('8')).resolves.toEqual(row);

    const [query, params] = executeQuery.mock.calls.at(-1);
    expect(query).toMatch(/DELETE FROM plantilla AS target/);
    expect(query).toMatch(/NOT EXISTS/);
    expect(query).toMatch(/notificacion\.plantilla_id = target\.id/);
    expect(params).toEqual(['8']);
  });

  it('returns undefined when a template cannot be deleted', async () => {
    executeQuery.mockResolvedValue([]);

    await expect(deleteTemplateById('8')).resolves.toBeUndefined();
  });
});
