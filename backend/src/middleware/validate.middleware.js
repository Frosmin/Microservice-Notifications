import { logger } from '@tigo/logger';
import {
  createTemplateSchema,
  templateParamsSchema
} from '../../schemas/template.schema.js';
import {
  createNotificationSchema,
  getNotificationParamsSchema,
  listNotificationsQuerySchema,
  retryNotificationParamsSchema
} from '../../schemas/notification.schema.js';
import { errorCodes } from '../utils/errorCodes.js';
import { sendError } from '../utils/response.js';

const validate = (schema) => (req, res, next) => {
  logger.info({ '[REQUEST PARAMS]': req.params });
  logger.info({ '[REQUEST BODY]': req.body });

  const result = schema.safeParse(req.body);
  if (!result.success) {
    logger.info({ '[VALIDATION ISSUES]': result.error.issues });
    const { statusHttp, response } = sendError(errorCodes.MISSING_REQUIRED_PARAMETER);
    return res.status(statusHttp).json(response);
  }

  req.body = result.data;
  return next();
};

const validateNotification = (req, res, next) => {
  logger.info({ '[REQUEST PARAMS]': req.params });
  logger.info({ '[REQUEST BODY]': req.body });

  const idempotencyKey = req.get?.('Idempotency-Key')
    ?? req.headers?.['idempotency-key'];
  const result = createNotificationSchema.safeParse({
    idempotencyKey,
    body: req.body
  });

  if (!result.success) {
    logger.info({ '[VALIDATION ISSUES]': result.error.issues });
    const { statusHttp, response } = sendError(errorCodes.MISSING_REQUIRED_PARAMETER);
    return res.status(statusHttp).json(response);
  }

  req.body = result.data.body;
  req.idempotencyKey = result.data.idempotencyKey;
  return next();
};

const validateParams = (schema) => (req, res, next) => {
  logger.info({ '[REQUEST PARAMS]': req.params });
  const result = schema.safeParse(req.params);

  if (!result.success) {
    logger.info({ '[VALIDATION ISSUES]': result.error.issues });
    const { statusHttp, response } = sendError(errorCodes.MISSING_REQUIRED_PARAMETER);
    return res.status(statusHttp).json(response);
  }

  req.params = result.data;
  return next();
};

const validateQuery = (schema) => (req, res, next) => {
  logger.info({ '[REQUEST QUERY]': req.query });
  const result = schema.safeParse(req.query ?? {});

  if (!result.success) {
    logger.info({ '[VALIDATION ISSUES]': result.error.issues });
    const { statusHttp, response } = sendError(errorCodes.MISSING_REQUIRED_PARAMETER);
    return res.status(statusHttp).json(response);
  }

  req.query = result.data;
  return next();
};

export const validateRequestMiddleware = {
  createTemplate: () => validate(createTemplateSchema),
  updateTemplate: () => validate(createTemplateSchema),
  templateId: () => validateParams(templateParamsSchema),
  createNotification: () => validateNotification,
  getNotification: () => validateParams(getNotificationParamsSchema),
  retryNotification: () => validateParams(retryNotificationParamsSchema),
  listNotifications: () => validateQuery(listNotificationsQuerySchema)
};
