import { logger } from '@tigo/logger';
import {
  createTemplateService,
  deleteTemplateService,
  updateTemplateService
} from '../services/template.service.js';
import { sendError } from '../utils/response.js';

export async function createTemplateController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    responseBody = await createTemplateService(req.body);
    return res.status(201).json(responseBody);
  } catch (error) {
    const { statusHttp, response } = sendError(error?.errorCode);
    responseBody = response;
    return res.status(statusHttp).json(responseBody);
  } finally {
    logger.info({ '[RESPONSE BODY]': responseBody });
    logger.endTimer('ExecutionTimeAll');
  }
}

export async function updateTemplateController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    responseBody = await updateTemplateService(req.params.id, req.body);
    return res.status(200).json(responseBody);
  } catch (error) {
    const { statusHttp, response } = sendError(error?.errorCode);
    responseBody = response;
    return res.status(statusHttp).json(responseBody);
  } finally {
    logger.info({ '[RESPONSE BODY]': responseBody });
    logger.endTimer('ExecutionTimeAll');
  }
}

export async function deleteTemplateController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    await deleteTemplateService(req.params.id);
    return res.status(204).send();
  } catch (error) {
    const { statusHttp, response } = sendError(error?.errorCode);
    responseBody = response;
    return res.status(statusHttp).json(responseBody);
  } finally {
    logger.info({ '[RESPONSE BODY]': responseBody });
    logger.endTimer('ExecutionTimeAll');
  }
}
