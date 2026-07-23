import { logger } from '@tigo/logger';
import { sendError } from '../utils/response.js';

export async function healthController(req, res) {
  let responseBody = {};
  try {
    responseBody = { status: 'UP' };
    return res.status(200).json(responseBody);
  } catch (error) {
    const { statusHttp, response } = sendError(error?.errorCode);
    responseBody = response;
    return res.status(statusHttp).json(responseBody);
  } finally {
    logger.info({ '[HEALTH RESPONSE]': responseBody });
  }
}
