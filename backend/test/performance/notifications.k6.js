import http from 'k6/http';
import { check } from 'k6';

const RATE = Number(__ENV.RATE || 10);
const DURATION = __ENV.DURATION || '1m';
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3050').replace(/\/$/, '');
const SERVICE_API_KEY = __ENV.SERVICE_API_KEY;
const TEMPLATE_ID = Number(__ENV.TEMPLATE_ID);
const CHANNEL = String(__ENV.CHANNEL || 'EMAIL').toUpperCase();
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 20);
const MAX_VUS = Number(__ENV.MAX_VUS || 100);

if (!Number.isSafeInteger(TEMPLATE_ID) || TEMPLATE_ID <= 0) {
  throw new Error('TEMPLATE_ID debe ser un entero positivo');
}

if (!SERVICE_API_KEY) {
  throw new Error('SERVICE_API_KEY es requerida');
}

if (!['EMAIL', 'SMS'].includes(CHANNEL)) {
  throw new Error('CHANNEL debe ser EMAIL o SMS');
}

if (!Number.isFinite(RATE) || RATE <= 0) {
  throw new Error('RATE debe ser un numero positivo');
}

if (!Number.isSafeInteger(PRE_ALLOCATED_VUS) || PRE_ALLOCATED_VUS <= 0) {
  throw new Error('PRE_ALLOCATED_VUS debe ser un entero positivo');
}

if (!Number.isSafeInteger(MAX_VUS) || MAX_VUS < PRE_ALLOCATED_VUS) {
  throw new Error('MAX_VUS debe ser mayor o igual que PRE_ALLOCATED_VUS');
}

export const options = {
  scenarios: {
    create_notifications: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
    dropped_iterations: ['count==0'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const uniqueRequestId = `${Date.now()}-${__VU}-${__ITER}`;
  const destination = __ENV.DESTINATION || (CHANNEL === 'SMS'
    ? '+59170000000'
    : `performance-${uniqueRequestId}@example.com`);
  const payload = JSON.stringify({
    canal: CHANNEL,
    destinatario: destination,
    plantillaId: TEMPLATE_ID,
    variables: {
      nombre: `Usuario ${__VU}`,
      pedido: uniqueRequestId,
    },
  });

  const response = http.post(
    `${BASE_URL}/api/v1/notifications`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': SERVICE_API_KEY,
        'Idempotency-Key': `k6-${uniqueRequestId}`,
      },
      tags: {
        operation: 'create-notification',
        channel: CHANNEL,
      },
      timeout: __ENV.REQUEST_TIMEOUT || '5s',
    },
  );

  check(response, {
    'notificacion aceptada con HTTP 202': (res) => res.status === 202,
  });

  if (response.status !== 202 && __ITER === 0) {
    console.error(`HTTP ${response.status}: ${response.body}`);
  }
}
