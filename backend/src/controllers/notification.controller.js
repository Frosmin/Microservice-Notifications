import { logger } from '@tigo/logger';
import {
  createNotificationService,
  getNotificationService,
  listNotificationsService,
  retryNotificationService
} from '../services/notification.service.js';
import { sendError } from '../utils/response.js';

export async function createNotificationController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    const result = await createNotificationService(req.body, req.idempotencyKey);
    responseBody = result.notification;
    return res.status(result.created ? 202 : 200).json(responseBody);
  } catch (error) {
    const { statusHttp, response } = sendError(error?.errorCode);
    responseBody = response;
    return res.status(statusHttp).json(responseBody);
  } finally {
    logger.info({ '[RESPONSE BODY]': responseBody });
    logger.endTimer('ExecutionTimeAll');
  }
}

export async function getNotificationController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    responseBody = await getNotificationService(req.params.id);
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

export async function listNotificationsController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    responseBody = await listNotificationsService(req.query);
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

export async function retryNotificationController(req, res) {
  let responseBody = {};
  logger.startTimer('ExecutionTimeAll');

  try {
    responseBody = await retryNotificationService(req.params.id);
    return res.status(202).json(responseBody);
  } catch (error) {
    const { statusHttp, response } = sendError(error?.errorCode);
    responseBody = response;
    return res.status(statusHttp).json(responseBody);
  } finally {
    logger.info({ '[RESPONSE BODY]': responseBody });
    logger.endTimer('ExecutionTimeAll');
  }
}
