import http from 'k6/http';
import { check } from 'k6';

const RATE = Number(__ENV.RATE || 10);
const DURATION = __ENV.DURATION || '1m';
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3050').replace(/\/$/, '');
const SERVICE_API_KEY = __ENV.SERVICE_API_KEY;
const CHANNEL = String(__ENV.CHANNEL || 'EMAIL').toUpperCase();
const STATUS = String(__ENV.STATUS || 'ENCOLADA').toUpperCase();
const PAGE = Number(__ENV.PAGE || 1);
const LIMIT = Number(__ENV.LIMIT || 20);
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 20);
const MAX_VUS = Number(__ENV.MAX_VUS || 100);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '5s';

if (!SERVICE_API_KEY) {
  throw new Error('SERVICE_API_KEY es requerida');
}

if (!['EMAIL', 'SMS'].includes(CHANNEL)) {
  throw new Error('CHANNEL debe ser EMAIL o SMS');
}

if (!['ENCOLADA', 'ENVIADA', 'FALLIDA'].includes(STATUS)) {
  throw new Error('STATUS debe ser ENCOLADA, ENVIADA o FALLIDA');
}

if (!Number.isSafeInteger(PAGE) || PAGE <= 0) {
  throw new Error('PAGE debe ser un entero positivo');
}

if (!Number.isSafeInteger(LIMIT) || LIMIT < 1 || LIMIT > 100) {
  throw new Error('LIMIT debe ser un entero entre 1 y 100');
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
    list_notification_history: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    'http_req_duration{operation:list-notifications}': ['p(95)<500'],
    'http_req_failed{operation:list-notifications}': ['rate<0.01'],
    'dropped_iterations{scenario:list_notification_history}': ['count==0'],
    checks: ['rate>0.99'],
  },
};

export default function () {
  const query = `canal=${CHANNEL}&estado=${STATUS}&page=${PAGE}&limit=${LIMIT}`;
  const response = http.get(
    `${BASE_URL}/api/v1/notifications?${query}`,
    {
      headers: { 'X-API-Key': SERVICE_API_KEY },
      tags: {
        operation: 'list-notifications',
        channel: CHANNEL,
        status: STATUS,
      },
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
    'historial devuelve HTTP 200': (res) => res.status === 200,
    'respuesta contiene items': () => Array.isArray(body?.items),
    'items respetan canal y estado': () => (
      Array.isArray(body?.items)
      && body.items.every((item) => item.canal === CHANNEL && item.estado === STATUS)
    ),
    'cantidad respeta el limite': () => Array.isArray(body?.items) && body.items.length <= LIMIT,
    'paginacion conserva page y limit': () => (
      body?.pagination?.page === PAGE && body?.pagination?.limit === LIMIT
    ),
    'paginacion contiene totales validos': () => (
      Number.isInteger(body?.pagination?.totalItems)
      && body.pagination.totalItems >= 0
      && Number.isInteger(body?.pagination?.totalPages)
      && body.pagination.totalPages >= 0
    ),
  });

  if (response.status !== 200 && __ITER === 0) {
    console.error(`HTTP ${response.status}: ${response.body}`);
  }
}
