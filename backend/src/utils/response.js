import { getErrorMessage } from '@tigo/error-code';
import { errorCodes } from '../utils/errorCodes.js';

export function sendError(errorCode) {
  const code = errorCode ?? errorCodes.GENERIC_INTERNAL_SERVER_ERROR;
  const { statusHttp, message } = getErrorMessage(code);
  const response = {
    error: {
      code,
      message
    }
  };
  return { statusHttp, response };
}
