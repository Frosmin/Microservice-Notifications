import { logger } from '@tigo/logger';
import {
  deleteTemplateById,
  findTemplateById,
  insertTemplate,
  updateTemplateById
} from '../repositories/template.repository.js';
import { errorCodes, setError } from '../utils/errorCodes.js';

export const createTemplateService = async (template) => {
  logger.info({
    createTemplateService: {
      '[NOMBRE]': template.nombre,
      '[CANAL]': template.canal
    }
  });

  const createdTemplate = await insertTemplate(template);
  if (!createdTemplate) {
    throw setError(
      `Template ${template.nombre} already exists for channel ${template.canal}`,
      errorCodes.RESOURCE_CONFLICT
    );
  }

  return createdTemplate;
};

export const updateTemplateService = async (id, template) => {
  const updatedTemplate = await updateTemplateById(id, template);
  if (updatedTemplate) {
    return updatedTemplate;
  }

  const existingTemplate = await findTemplateById(id);
  if (!existingTemplate) {
    throw setError('Template not found', errorCodes.NOT_FOUND);
  }

  throw setError(
    `Template ${template.nombre} already exists for channel ${template.canal}`,
    errorCodes.RESOURCE_CONFLICT
  );
};

export const deleteTemplateService = async (id) => {
  const deletedTemplate = await deleteTemplateById(id);
  if (deletedTemplate) {
    return;
  }

  const existingTemplate = await findTemplateById(id);
  if (!existingTemplate) {
    throw setError('Template not found', errorCodes.NOT_FOUND);
  }

  throw setError(
    'Template has associated notifications',
    errorCodes.RESOURCE_CONFLICT
  );
};
