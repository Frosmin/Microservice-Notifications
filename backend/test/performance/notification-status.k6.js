import http from 'k6/http';
import { check } from 'k6';

const RATE = Number(__ENV.RATE || 10);
const DURATION = __ENV.DURATION || '1m';
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3050').replace(/\/$/, '');
const SERVICE_API_KEY = __ENV.SERVICE_API_KEY;
const NOTIFICATION_ID = String(__ENV.NOTIFICATION_ID || '').trim();
const EXPECTED_STATUS = String(__ENV.EXPECTED_STATUS || '').trim().toUpperCase();
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 20);
const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '5s';
const VALID_STATUSES = ['ENCOLADA', 'ENVIADA', 'FALLIDA'];

if (!SERVICE_API_KEY) {
  throw new Error('SERVICE_API_KEY es requerida');
}

if (!/^[1-9]\d*$/.test(NOTIFICATION_ID)) {
  throw new Error('NOTIFICATION_ID debe ser un entero positivo');
}

if (EXPECTED_STATUS && !VALID_STATUSES.includes(EXPECTED_STATUS)) {
  throw new Error('EXPECTED_STATUS debe ser ENCOLADA, ENVIADA o FALLIDA');
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
    get_notification_status: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    'http_req_duration{operation:get-notification}': ['p(95)<500'],
    'http_req_failed{operation:get-notification}': ['rate<0.01'],
    'dropped_iterations{scenario:get_notification_status}': ['count==0'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const response = http.get(
    `${BASE_URL}/api/v1/notifications/${NOTIFICATION_ID}`,
    {
      headers: { 'X-API-Key': SERVICE_API_KEY },
      tags: { operation: 'get-notification' },
      timeout: REQUEST_TIMEOUT,
    },
  );

  let body;
  try {
    body = response.json();
  } catch {
    body = null;
  }

  check(response, {
    'consulta devuelve HTTP 200': (res) => res.status === 200,
    'devuelve la notificacion solicitada': () => String(body?.id) === NOTIFICATION_ID,
    'estado es valido': () => VALID_STATUSES.includes(body?.estado),
    'estado coincide con el esperado': () => !EXPECTED_STATUS || body?.estado === EXPECTED_STATUS,
    'incluye historial de intentos': () => Array.isArray(body?.historialIntentos),
  });

  if (response.status !== 200 && __ITER === 0) {
    console.error(`HTTP ${response.status}: ${response.body}`);
  }
}
