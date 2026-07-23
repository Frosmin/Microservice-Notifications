import { describe, expect, it, vi } from 'vitest';

const { mockRouter } = vi.hoisted(() => ({
  mockRouter: {
    delete: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn()
  }
}));

vi.mock('ultimate-express', () => ({
  default: { Router: () => mockRouter }
}));
vi.mock('../../../src/controllers/health.controller.js', () => ({
  healthController: 'healthController'
}));
vi.mock('../../../src/controllers/template.controller.js', () => ({
  createTemplateController: 'createTemplateController',
  deleteTemplateController: 'deleteTemplateController',
  updateTemplateController: 'updateTemplateController'
}));
vi.mock('../../../src/controllers/notification.controller.js', () => ({
  createNotificationController: 'createNotificationController',
  getNotificationController: 'getNotificationController',
  listNotificationsController: 'listNotificationsController',
  retryNotificationController: 'retryNotificationController'
}));
vi.mock('../../../src/middleware/validate.middleware.js', () => ({
  validateRequestMiddleware: {
    createTemplate: vi.fn(() => 'createTemplateValidator'),
    updateTemplate: vi.fn(() => 'updateTemplateValidator'),
    templateId: vi.fn(() => 'templateIdValidator'),
    createNotification: vi.fn(() => 'createNotificationValidator'),
    getNotification: vi.fn(() => 'getNotificationValidator'),
    listNotifications: vi.fn(() => 'listNotificationsValidator'),
    retryNotification: vi.fn(() => 'retryNotificationValidator')
  }
}));

describe('router.routes.js', () => {
  it('registers health, templates and notification endpoints', async () => {
    await import('../../../src/routes/router.routes.js');

    expect(mockRouter.get).toHaveBeenCalledWith('/health', 'healthController');
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/templates',
      'createTemplateValidator',
      'createTemplateController'
    );
    expect(mockRouter.put).toHaveBeenCalledWith(
      '/templates/:id',
      'templateIdValidator',
      'updateTemplateValidator',
      'updateTemplateController'
    );
    expect(mockRouter.delete).toHaveBeenCalledWith(
      '/templates/:id',
      'templateIdValidator',
      'deleteTemplateController'
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/notifications',
      'createNotificationValidator',
      'createNotificationController'
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/notifications',
      'listNotificationsValidator',
      'listNotificationsController'
    );
    expect(mockRouter.get).toHaveBeenCalledWith(
      '/notifications/:id',
      'getNotificationValidator',
      'getNotificationController'
    );
    expect(mockRouter.post).toHaveBeenCalledWith(
      '/notifications/:id/retry',
      'retryNotificationValidator',
      'retryNotificationController'
    );
  });
});
