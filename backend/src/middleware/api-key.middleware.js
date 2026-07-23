import { createHash, timingSafeEqual } from 'node:crypto';
import config from '../utils/config.js';
import { errorCodes } from '../utils/errorCodes.js';

const MINIMUM_API_KEY_LENGTH = 32;

const digest = (value) => createHash('sha256').update(value, 'utf8').digest();

const sendAuthenticationError = (res) => {
  res.setHeader('WWW-Authenticate', 'ApiKey realm="notifications"');
  return res.status(401).json({
    error: {
      code: errorCodes.UNAUTHORIZED,
      message: 'Unauthorized'
    }
  });
};

const sendConfigurationError = (res) => res.status(503).json({
  error: {
    code: 'SU001',
    message: 'Service temporarily unavailable'
  }
});

export const createApiKeyMiddleware = ({
  apiKey = config.SERVICE_API_KEY,
  publicPaths = ['/health', `${config.API_BASE_PATH}/health`]
} = {}) => {
  const configuredApiKey = typeof apiKey === 'string' && apiKey.length >= MINIMUM_API_KEY_LENGTH;
  const expectedDigest = configuredApiKey ? digest(apiKey) : null;
  const publicPathSet = new Set(publicPaths);

  return (req, res, next) => {
    const requestPath = req.path || String(req.url || '').split('?')[0];
    if (publicPathSet.has(requestPath)) {
      return next();
    }

    if (!expectedDigest) {
      return sendConfigurationError(res);
    }

    const suppliedKey = req.get?.('x-api-key') ?? req.headers?.['x-api-key'];
    if (typeof suppliedKey !== 'string' || suppliedKey.length === 0) {
      return sendAuthenticationError(res);
    }

    const suppliedDigest = digest(suppliedKey);
    if (!timingSafeEqual(expectedDigest, suppliedDigest)) {
      return sendAuthenticationError(res);
    }

    return next();
  };
};

export const apiKeyMiddleware = createApiKeyMiddleware();
