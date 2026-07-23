import config from '../utils/config.js';
import { PermanentDeliveryError } from './delivery.errors.js';

const TWILIO_MAX_BODY_LENGTH = 1600;
const isRetryableStatus = (status) => status === 408 || status === 429 || status >= 500;

const twilioErrorMessage = async (response) => {
  const raw = await response.text();
  let detail;
  try {
    const parsed = JSON.parse(raw);
    const code = parsed.code ? ` [${parsed.code}]` : '';
    detail = `${code}: ${parsed.message || raw}`;
  } catch {
    detail = raw ? `: ${raw}` : '';
  }
  return `Twilio SMS returned ${response.status}${detail}`.slice(0, 1000);
};

export const createSmsSender = ({
  accountSid = config.TWILIO_ACCOUNT_SID,
  authToken = config.TWILIO_AUTH_TOKEN,
  fromNumber = config.TWILIO_FROM_NUMBER,
  apiBaseUrl = config.TWILIO_API_BASE_URL,
  timeoutMs = config.PROVIDER_TIMEOUT_MS,
  fetchImplementation = globalThis.fetch
} = {}) => async ({ notificationId, to, message }) => {
  if (!accountSid || !authToken || !fromNumber) {
    throw new PermanentDeliveryError('Twilio SMS configuration is incomplete');
  }
  if (typeof message !== 'string' || message.length === 0) {
    throw new PermanentDeliveryError('Twilio SMS body cannot be empty');
  }
  if (message.length > TWILIO_MAX_BODY_LENGTH) {
    throw new PermanentDeliveryError(
      `Twilio SMS body exceeds ${TWILIO_MAX_BODY_LENGTH} characters`
    );
  }

  const baseUrl = apiBaseUrl.replace(/\/$/, '');
  const providerUrl = `${baseUrl}/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const credentials = Buffer.from(`${accountSid}:${authToken}`, 'utf8').toString('base64');
  const body = new URLSearchParams({ To: to, From: fromNumber, Body: message });

  const response = await fetchImplementation(providerUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'
    },
    body,
    signal: AbortSignal.timeout(timeoutMs)
  });

  if (!response.ok) {
    const errorMessage = await twilioErrorMessage(response);
    if (isRetryableStatus(response.status)) throw new Error(errorMessage);
    throw new PermanentDeliveryError(errorMessage);
  }

  const result = await response.json();
  if (!result?.sid) {
    throw new Error(`Twilio SMS response for notification ${notificationId} has no Message SID`);
  }
  return { messageId: result.sid, status: result.status };
};
