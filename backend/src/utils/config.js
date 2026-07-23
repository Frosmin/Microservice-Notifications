/**
 * Punto unico para leer variables de entorno.
 * Agregar aqui cada variable que use el microservicio, con su valor por
 * defecto cuando aplique. El resto del codigo debe importar desde este modulo
 * y nunca leer process.env directamente.
 */
const positiveInteger = (value, fallback) => {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export default {
  API_BASE_PATH: process.env.API_BASE_PATH || '/api/v1',
  SERVICE_API_KEY: process.env.SERVICE_API_KEY,
  REDIS_HOST: process.env.REDIS_HOST || 'localhost',
  REDIS_PORT: Number(process.env.REDIS_PORT || 6379),
  REDIS_PASSWORD: process.env.REDIS_PASSWORD || undefined,
  NOTIFICATION_QUEUE: process.env.NOTIFICATION_QUEUE || 'notification-delivery',
  MAX_NOTIFICATION_ATTEMPTS: positiveInteger(process.env.MAX_NOTIFICATION_ATTEMPTS, 5),
  RETRY_BACKOFF_MS: positiveInteger(process.env.RETRY_BACKOFF_MS, 1000),
  SENDS_PER_MINUTE: positiveInteger(process.env.SENDS_PER_MINUTE, 60),
  WORKER_CONCURRENCY: positiveInteger(process.env.WORKER_CONCURRENCY, 5),
  OUTBOX_POLL_INTERVAL_MS: positiveInteger(process.env.OUTBOX_POLL_INTERVAL_MS, 1000),
  OUTBOX_BATCH_SIZE: positiveInteger(process.env.OUTBOX_BATCH_SIZE, 20),
  OUTBOX_MAX_BACKOFF_MS: positiveInteger(process.env.OUTBOX_MAX_BACKOFF_MS, 60000),
  PROVIDER_TIMEOUT_MS: positiveInteger(process.env.PROVIDER_TIMEOUT_MS, 10000),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_APP_PASSWORD: process.env.SMTP_APP_PASSWORD,
  SMTP_FROM: process.env.SMTP_FROM,
  TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
  TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
  TWILIO_FROM_NUMBER: process.env.TWILIO_FROM_NUMBER,
  TWILIO_API_BASE_URL: process.env.TWILIO_API_BASE_URL || 'https://api.twilio.com',
  TWILIO_TEST_TO: process.env.TWILIO_TEST_TO
};
