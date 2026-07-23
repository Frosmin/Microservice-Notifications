import ultimateExpress from 'ultimate-express';
import { healthController } from '../controllers/health.controller.js';
import {
  createTemplateController,
  deleteTemplateController,
  updateTemplateController
} from '../controllers/template.controller.js';
import {
  createNotificationController,
  getNotificationController,
  listNotificationsController,
  retryNotificationController
} from '../controllers/notification.controller.js';
import { validateRequestMiddleware } from '../middleware/validate.middleware.js';
const { Router } = ultimateExpress;

const router = Router();

// Health check (sin validacion)
router.get('/health', healthController);

//templates
router.post(
  '/templates',
  validateRequestMiddleware.createTemplate(),
  createTemplateController
);

router.put(
  '/templates/:id',
  validateRequestMiddleware.templateId(),
  validateRequestMiddleware.updateTemplate(),
  updateTemplateController
);

router.delete(
  '/templates/:id',
  validateRequestMiddleware.templateId(),
  deleteTemplateController
);

//notifications
router.get(
  '/notifications',
  validateRequestMiddleware.listNotifications(),
  listNotificationsController
);

router.get(
  '/notifications/:id',
  validateRequestMiddleware.getNotification(),
  getNotificationController
);

router.post(
  '/notifications/:id/retry',
  validateRequestMiddleware.retryNotification(),
  retryNotificationController
);

router.post(
  '/notifications',
  validateRequestMiddleware.createNotification(),
  createNotificationController
);

export default router;
