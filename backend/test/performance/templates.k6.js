import http from 'k6/http';
import { check } from 'k6';

const RATE = Number(__ENV.RATE || 2);
const DURATION = __ENV.DURATION || '1m';
const BASE_URL = (__ENV.BASE_URL || 'http://localhost:3050').replace(/\/$/, '');
const SERVICE_API_KEY = __ENV.SERVICE_API_KEY;
const CHANNEL = String(__ENV.CHANNEL || 'EMAIL').toUpperCase();
const PRE_ALLOCATED_VUS = Number(__ENV.PRE_ALLOCATED_VUS || 10);
const MAX_VUS = Number(__ENV.MAX_VUS || 50);
const REQUEST_TIMEOUT = __ENV.REQUEST_TIMEOUT || '5s';

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
    manage_templates: {
      executor: 'constant-arrival-rate',
      rate: RATE,
      timeUnit: '1s',
      duration: DURATION,
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: MAX_VUS,
    },
  },
  thresholds: {
    'http_req_duration{operation:create-template}': ['p(95)<500'],
    'http_req_duration{operation:duplicate-template}': ['p(95)<500'],
    'http_req_duration{operation:update-template}': ['p(95)<500'],
    'http_req_duration{operation:delete-template}': ['p(95)<500'],
    'http_req_failed{operation:create-template}': ['rate<0.01'],
    'http_req_failed{operation:duplicate-template}': ['rate<0.01'],
    'http_req_failed{operation:update-template}': ['rate<0.01'],
    'http_req_failed{operation:delete-template}': ['rate<0.01'],
    'dropped_iterations{scenario:manage_templates}': ['count==0'],
    checks: ['rate>0.99'],
  },
};

function requestParams(operation, responseCallback) {
  return {
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': SERVICE_API_KEY,
    },
    tags: { operation },
    timeout: REQUEST_TIMEOUT,
    ...(responseCallback ? { responseCallback } : {}),
  };
}

export default function () {
  const uniqueId = `${Date.now()}-${__VU}-${__ITER}`;
  const name = `k6-${CHANNEL.toLowerCase()}-${uniqueId}`;
  const createPayload = JSON.stringify({
    nombre: name,
    canal: CHANNEL,
    contenido: 'Hola {{nombre}}, esta es una prueba de rendimiento.',
    variables: ['nombre'],
  });

  const createResponse = http.post(
    `${BASE_URL}/api/v1/templates`,
    createPayload,
    requestParams('create-template'),
  );

  let createdTemplate;
  try {
    createdTemplate = createResponse.json();
  } catch {
    createdTemplate = null;
  }

  const created = check(createResponse, {
    'plantilla creada con HTTP 201': (res) => res.status === 201,
    'plantilla creada tiene id': () => /^[1-9]\d*$/.test(String(createdTemplate?.id || '')),
    'plantilla creada conserva nombre y canal': () => (
      createdTemplate?.nombre === name && createdTemplate?.canal === CHANNEL
    ),
  });

  if (!created) {
    if (__ITER === 0) {
      console.error(`No se pudo crear plantilla. HTTP ${createResponse.status}: ${createResponse.body}`);
    }
    return;
  }

  const duplicateResponse = http.post(
    `${BASE_URL}/api/v1/templates`,
    createPayload,
    requestParams('duplicate-template', http.expectedStatuses(409)),
  );

  check(duplicateResponse, {
    'nombre duplicado por canal devuelve HTTP 409': (res) => res.status === 409,
  });

  const updatedName = `${name}-updated`;
  const updateResponse = http.put(
    `${BASE_URL}/api/v1/templates/${createdTemplate.id}`,
    JSON.stringify({
      nombre: updatedName,
      canal: CHANNEL,
      contenido: 'Hola {{nombre}}, plantilla actualizada por k6.',
      variables: ['nombre'],
    }),
    requestParams('update-template'),
  );

  let updatedTemplate;
  try {
    updatedTemplate = updateResponse.json();
  } catch {
    updatedTemplate = null;
  }

  check(updateResponse, {
    'plantilla actualizada con HTTP 200': (res) => res.status === 200,
    'plantilla actualizada conserva id': () => String(updatedTemplate?.id) === String(createdTemplate.id),
    'plantilla actualizada cambia nombre': () => updatedTemplate?.nombre === updatedName,
  });

  const deleteResponse = http.del(
    `${BASE_URL}/api/v1/templates/${createdTemplate.id}`,
    null,
    requestParams('delete-template'),
  );

  check(deleteResponse, {
    'plantilla eliminada con HTTP 204': (res) => res.status === 204,
  });
}
