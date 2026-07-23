# P07 - Microservicio de notificaciones

Servicio backend de Tigo para administrar plantillas y enviar notificaciones
por EMAIL o SMS. La API acepta y persiste cada solicitud en PostgreSQL; un
worker independiente publica los eventos en BullMQ y realiza la entrega con
control de estado, idempotencia y reintentos con backoff exponencial.

## Tabla de contenidos

- [Stack](#stack)
- [Arquitectura](#arquitectura)
- [Flujo de entrega](#flujo-de-entrega)
- [Estructura del proyecto](#estructura-del-proyecto)
- [Modelo de datos](#modelo-de-datos)
- [Documentacion OpenAPI](#documentacion-openapi)
- [Endpoints](#endpoints)
- [Ejemplos de uso](#ejemplos-de-uso)
- [Reglas de negocio](#reglas-de-negocio)
- [Variables de entorno](#variables-de-entorno)
- [Ejecucion local](#ejecucion-local)
- [Docker Compose](#docker-compose)
- [Scripts](#scripts)
- [Testing](#testing)
- [Observabilidad y seguridad](#observabilidad-y-seguridad)

## Stack

- Node.js 22 con modulos ESM.
- `ultimate-express` como framework HTTP.
- PostgreSQL como fuente de verdad.
- `@tigo/postgres-connector` para acceso a datos.
- `zod` para validacion estricta de body, params, query y headers.
- BullMQ + Redis para procesamiento asincrono.
- Nodemailer para EMAIL y la API REST de Twilio para SMS.
- Patron transactional outbox para aceptar solicitudes aunque Redis este caido.
- `helmet` y Content Security Policy para hardening HTTP.
- `express-prom-bundle` para metricas Prometheus.
- OpenAPI 3.1 + Swagger UI para documentacion interactiva.
- Vitest para pruebas unitarias, de contrato y smoke tests.

## Arquitectura

La API y el worker se ejecutan como procesos independientes:

```text
Servicio emisor
      |
      v
API REST --> PostgreSQL <--- Worker / Outbox Publisher
                |                    |
                |                    v
                +---------------> Redis / BullMQ
                                      |
                                      v
                              Proveedor EMAIL o SMS
```

El codigo mantiene la separacion por capas:

```text
route -> middleware (Zod) -> controller -> service -> repository -> PostgreSQL
```

- Las rutas declaran endpoints y validadores.
- Los middlewares normalizan y validan la entrada.
- Los controllers traducen el resultado a HTTP.
- Los services contienen las reglas de negocio.
- Los repositories encapsulan SQL parametrizado.
- Los providers aislan los contratos de Gmail SMTP y Twilio REST.

## Flujo de entrega

1. `POST /api/v1/notifications` valida `Idempotency-Key`, la plantilla, el
   canal, el destinatario y las variables.
2. La API crea `notificacion` y `notification_outbox` dentro de la misma
   transaccion PostgreSQL.
3. El publicador del worker reclama eventos pendientes con
   `FOR UPDATE SKIP LOCKED` y crea un job BullMQ con un identificador estable.
4. El procesador toma un advisory lock por notificacion y vuelve a consultar
   su estado antes de invocar al proveedor.
5. Cada resultado se registra en `intento`. Los fallos transitorios se
   reintentan con backoff exponencial; los permanentes o el ultimo intento
   cambian la notificacion a `FALLIDA`.

La entrega es **al menos una vez**. PostgreSQL, el outbox, los locks, los IDs de
job y las claves idempotentes reducen duplicados. SMTP no permite garantizar
exactamente una vez si el proceso cae despues de que el proveedor acepta el
mensaje.

## Estructura del proyecto

```text
backend/
|-- index.js                         # Bootstrap de la API
|-- worker.js                        # Bootstrap del worker y outbox publisher
|-- docs/
|   `-- openapi.json                 # Contrato OpenAPI 3.1
|-- schemas/                         # Esquemas Zod de entrada
|-- src/
|   |-- app.js                       # Middlewares, seguridad, Swagger y rutas
|   |-- controllers/                 # Adaptacion HTTP
|   |-- infrastructure/              # Transacciones y cliente Redis
|   |-- middleware/                  # Validacion de requests
|   |-- openapi/                     # Carga del contrato OpenAPI
|   |-- providers/                   # EMAIL, SMS y render de plantillas
|   |-- queues/                      # Configuracion BullMQ
|   |-- repositories/                # Consultas PostgreSQL
|   |-- routes/                      # Definicion de endpoints
|   |-- runtime/                     # Apagado ordenado
|   |-- services/                    # Reglas de negocio
|   |-- utils/                       # Configuracion, errores y constantes
|   `-- workers/                     # Publicacion y procesamiento asincrono
|-- test/
|   |-- unit-test/                   # Pruebas unitarias y de OpenAPI
|   `-- smoke/                       # Flujo real de entrega
|-- tablas.sql                       # Esquema completo para instalaciones nuevas
|-- migrations/                      # Cambios para bases existentes
|-- docker-compose.yml
`-- Dockerfile
```

## Modelo de datos

### `plantilla`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `BIGINT` identity | Clave primaria |
| `nombre` | `VARCHAR(100)` | Obligatorio; unico junto con `canal` |
| `canal` | `VARCHAR(50)` | `EMAIL` o `SMS` |
| `contenido` | `TEXT` | No puede estar vacio |
| `variables` | `VARCHAR(100)[]` | Variables requeridas por la plantilla |

### `notificacion`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `BIGINT` identity | Clave primaria |
| `canal` | `VARCHAR(50)` | `EMAIL` o `SMS` |
| `destinatario` | `VARCHAR(255)` | Email valido o telefono E.164 |
| `plantilla_id` | `BIGINT` | Referencia a `plantilla` |
| `variables` | `JSONB` | Objeto con las variables exactas de la plantilla |
| `idempotency_key` | `VARCHAR(128)` | Unica |
| `estado` | `VARCHAR(50)` | `ENCOLADA`, `ENVIADA` o `FALLIDA` |
| `intentos` | `INTEGER` | Contador no negativo |

### `intento`

| Columna | Tipo | Reglas |
|---|---|---|
| `id` | `BIGINT` identity | Clave primaria |
| `notificacion_id` | `BIGINT` | Referencia a `notificacion` |
| `numero` | `INTEGER` | Secuencia positiva por notificacion |
| `resultado` | `VARCHAR(20)` | `EXITOSO` o `FALLIDO` |
| `detalle` | `TEXT` | Respuesta o detalle del error |
| `timestamp` | `TIMESTAMPTZ` | Fecha del intento |

`notification_outbox` conserva los eventos pendientes de publicar y permite
recuperar el procesamiento despues de una caida de Redis o del worker.

## Documentacion OpenAPI

Con la API iniciada en el puerto predeterminado:

| Recurso | URL |
|---|---|
| Swagger UI | `http://localhost:3050/docs/` |
| Contrato OpenAPI JSON | `http://localhost:3050/openapi.json` |
| Archivo fuente | `docs/openapi.json` |

Swagger UI permite inspeccionar modelos, parametros, respuestas y ejecutar
solicitudes con **Try it out**. El contrato usa OpenAPI `3.1.0` y documenta
tambien `/metrics`, que se publica fuera de `/api/v1`.

La prueba `test/unit-test/openapi/openapi.document.test.js` valida
semanticamente el documento y comprueba que las nueve operaciones HTTP del
servicio esten documentadas.

## Endpoints

Base local: `http://localhost:3050/api/v1`.

| Metodo | Ruta | Respuesta | Descripcion |
|---|---|---:|---|
| `GET` | `/health` | `200` | Estado del proceso HTTP |
| `POST` | `/templates` | `201` | Crear una plantilla |
| `PUT` | `/templates/{id}` | `200` | Actualizar una plantilla |
| `DELETE` | `/templates/{id}` | `204` | Eliminar una plantilla sin notificaciones |
| `GET` | `/notifications` | `200` | Listar con filtros y paginacion |
| `POST` | `/notifications` | `202` / `200` | Crear o recuperar una solicitud idempotente |
| `GET` | `/notifications/{id}` | `200` | Consultar estado e intentos |
| `POST` | `/notifications/{id}/retry` | `202` | Reintentar una notificacion fallida |

Fuera del prefijo versionado:

| Metodo | Ruta | Descripcion |
|---|---|---|
| `GET` | `/metrics` | Metricas Prometheus |
| `GET` | `/openapi.json` | Contrato OpenAPI procesable |
| `GET` | `/docs/` | Swagger UI |

Las operaciones bajo `/api/v1` requieren el encabezado `X-API-Key`. La clave se
configura mediante `SERVICE_API_KEY`; `/api/v1/health`, `/metrics`,
`/openapi.json` y `/docs/` permanecen publicos para operacion y diagnostico.
En Dev y QA se debe usar una clave diferente por ambiente y nunca almacenarla
en el repositorio. En despliegues reales la API debe exponerse solamente por
HTTPS.

### Errores

Todos los errores usan la misma estructura:

```json
{
  "error": {
    "code": "NF001",
    "message": "Not found"
  }
}
```

| HTTP | Codigo frecuente | Uso |
|---:|---|---|
| `400` | `BR001` | Body, header, path o query invalido |
| `404` | `NF001` | Plantilla o notificacion inexistente |
| `409` | `CF001` | Duplicado, estado incompatible o idempotencia conflictiva |
| `500` | `SE001` | Error interno no esperado |
| `503` | `SU001` | Dependencia temporalmente no disponible |

## Ejemplos de uso

### Crear una plantilla EMAIL

```bash
curl --request POST 'http://localhost:3050/api/v1/templates' \
  --header 'X-API-Key: replace-with-your-service-api-key' \
  --header 'Content-Type: application/json' \
  --data '{
    "nombre": "confirmacion-pedido",
    "canal": "EMAIL",
    "contenido": "Hola {{nombre}}, tu pedido {{pedido}} fue confirmado.",
    "variables": ["nombre", "pedido"]
  }'
```

Respuesta `201`:

```json
{
  "id": "1",
  "nombre": "confirmacion-pedido",
  "canal": "EMAIL",
  "contenido": "Hola {{nombre}}, tu pedido {{pedido}} fue confirmado.",
  "variables": ["nombre", "pedido"]
}
```

### Enviar una notificacion

`Idempotency-Key` es obligatorio. El objeto `variables` debe tener exactamente
las claves declaradas por la plantilla.

```bash
curl --request POST 'http://localhost:3050/api/v1/notifications' \
  --header 'X-API-Key: replace-with-your-service-api-key' \
  --header 'Idempotency-Key: pedido-4521-email-confirmacion' \
  --header 'Content-Type: application/json' \
  --data '{
    "canal": "EMAIL",
    "destinatario": "cliente@example.com",
    "plantillaId": 1,
    "variables": {
      "nombre": "Ana",
      "pedido": 4521
    }
  }'
```

Una solicitud nueva devuelve `202`. Repetir la misma clave con el mismo body
devuelve `200` y la notificacion existente. Reutilizar la clave con otro body
devuelve `409`.

### Consultar estado e intentos

```bash
curl --header 'X-API-Key: replace-with-your-service-api-key' \
  'http://localhost:3050/api/v1/notifications/42'
```

La respuesta incluye `historialIntentos`, ordenado por numero de intento.

### Listar notificaciones

```bash
curl --header 'X-API-Key: replace-with-your-service-api-key' \
  'http://localhost:3050/api/v1/notifications?canal=EMAIL&estado=FALLIDA&page=1&limit=20'
```

Los filtros son opcionales. `page` comienza en `1` y `limit` admite valores de
`1` a `100`.

### Reintentar una notificacion fallida

```bash
curl --request POST 'http://localhost:3050/api/v1/notifications/42/retry' \
  --header 'X-API-Key: replace-with-your-service-api-key'
```

Solo se acepta si la notificacion esta `FALLIDA` y no alcanzo
`MAX_NOTIFICATION_ATTEMPTS`. Una operacion aceptada devuelve `202` y cambia el
estado a `ENCOLADA`.

## Reglas de negocio

- El nombre de una plantilla es unico dentro de su canal.
- Una plantilla asociada a notificaciones no puede eliminarse.
- EMAIL exige un destinatario con formato de correo valido.
- SMS exige un numero E.164, por ejemplo `+59170000000`.
- El canal de la notificacion debe coincidir con el canal de la plantilla.
- Las variables recibidas deben coincidir exactamente con las requeridas.
- Una notificacion `ENVIADA` nunca vuelve a invocar al proveedor.
- Los reintentos automaticos y manuales respetan el maximo configurado.
- Los fallos HTTP `408`, `429` y `5xx` de Twilio son transitorios; los
  demas `4xx` son permanentes.

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar credenciales y proveedores.

### API y PostgreSQL

| Variable | Requerida | Predeterminado / ejemplo |
|---|---|---|
| `PORT` | No | `3000`; `.env.example` usa `3050` |
| `API_BASE_PATH` | No | `/api/v1` |
| `SERVICE_API_KEY` | Si | Secreto aleatorio de al menos 32 caracteres; distinto por ambiente |
| `P_DB_HOST` | Si | `localhost` |
| `P_DB_PORT` | Si | `5432` |
| `P_DB_NAME` | Si | `mydatabase` |
| `P_DB_USER` | Si | `postgres` |
| `P_DB_PASSWORD` | Si | `postgres123` solo para desarrollo |
| `P_DB_MAX_CONNECTIONS` | No | `10` |
| `P_DB_CONNECTION_STRING` | No | Tiene prioridad sobre variables individuales |

### Redis, worker y outbox

| Variable | Predeterminado | Descripcion |
|---|---:|---|
| `REDIS_HOST` | `localhost` | Host Redis |
| `REDIS_PORT` | `6379` | Puerto Redis |
| `REDIS_PASSWORD` | sin valor | Password Redis |
| `NOTIFICATION_QUEUE` | `notification-delivery` | Nombre de la cola |
| `MAX_NOTIFICATION_ATTEMPTS` | `5` | Maximo de intentos totales |
| `RETRY_BACKOFF_MS` | `1000` | Backoff exponencial base |
| `SENDS_PER_MINUTE` | `60` | Limite de envios por minuto |
| `WORKER_CONCURRENCY` | `5` | Jobs procesados en paralelo |
| `OUTBOX_POLL_INTERVAL_MS` | `1000` | Intervalo de consulta del outbox |
| `OUTBOX_BATCH_SIZE` | `20` | Eventos reclamados por ciclo |
| `OUTBOX_MAX_BACKOFF_MS` | `60000` | Backoff maximo del publicador |
| `PROVIDER_TIMEOUT_MS` | `10000` | Timeout de proveedores externos |

### Proveedores

| Variable | Requerida para | Descripcion |
|---|---|---|
| `SMTP_USER` | EMAIL | Cuenta Gmail |
| `SMTP_APP_PASSWORD` | EMAIL | App Password; nunca usar la password normal |
| `SMTP_FROM` | EMAIL | Remitente visible |
| `TWILIO_ACCOUNT_SID` | SMS | Identificador de la cuenta Twilio |
| `TWILIO_AUTH_TOKEN` | SMS | Secreto de autenticacion; conservar solo en `.env` |
| `TWILIO_FROM_NUMBER` | SMS | Numero Twilio remitente en formato E.164 |
| `TWILIO_API_BASE_URL` | No | Predeterminado `https://api.twilio.com`; permite usar el mock local |
| `TWILIO_TEST_TO` | Prueba real | Destinatario E.164 para `npm run test:twilio` |

La falta de configuracion de un canal es terminal solo para los jobs de ese
canal; no impide que el worker procese el otro.

## Ejecucion local

### 1. Instalar dependencias

```bash
cd backend
npm install
```


Completar las credenciales de PostgreSQL, Redis y al menos el proveedor que se
quiera probar.

### 3. Crear las tablas

Para una base nueva, ejecutar `tablas.sql`. Para una base existente que aun no
tenga transactional outbox, aplicar `migrations/001_notification_outbox.sql`.

### 4. Iniciar procesos

Terminal 1, API:

```bash
npm run dev
```

Terminal 2, worker:

```bash
npm run dev:worker
```

Terminal 3, proveedor SMS simulado opcional:

```bash
npm run dev:sms-mock
```

Con el simulador Twilio local, configurar:

```dotenv
TWILIO_ACCOUNT_SID=AC00000000000000000000000000000000
TWILIO_AUTH_TOKEN=dev-twilio-token
TWILIO_FROM_NUMBER=+15005550006
TWILIO_API_BASE_URL=http://localhost:4010
```

## Docker Compose

API, worker, PostgreSQL y Redis:

```bash
docker compose up --build db redis api worker
```

El servicio queda disponible en:

- API: `http://localhost:3050/api/v1`
- Swagger: `http://localhost:3050/docs/`
- Metricas: `http://localhost:3050/metrics`

Para incluir el simulador SMS:
```bash
npm run 
```

para solo levantar el servidor mock
```bash
npm run dev:sms-mock
```


```bash
docker compose --profile development up --build
```

En ese caso, el worker debe usar:

```dotenv
TWILIO_ACCOUNT_SID=AC00000000000000000000000000000000
TWILIO_AUTH_TOKEN=dev-twilio-token
TWILIO_FROM_NUMBER=+15005550006
TWILIO_API_BASE_URL=http://sms-mock:4010
```

Redis se inicia con AOF y `maxmemory-policy noeviction`. PostgreSQL ejecuta
`tablas.sql` automaticamente la primera vez que se crea su volumen.

## Scripts

| Script | Descripcion |
|---|---|
| `npm start` | Inicia la API |
| `npm run dev` | Inicia la API con watch |
| `npm run start:worker` | Inicia publicador outbox y worker BullMQ |
| `npm run dev:worker` | Inicia el worker con watch |
| `npm run dev:sms-mock` | Inicia el proveedor SMS local |
| `npm test` | Ejecuta pruebas unitarias y de contrato |
| `npm run coverage` | Ejecuta cobertura V8 con umbral de 85% |
| `npm run lint` | Ejecuta ESLint y genera `docs/evidencias/quality/eslint-report.json` |
| `npm run test:performance` | Ejecuta K6 y guarda el resumen en `docs/evidencias/k6/summary.json` |
| `npm run test:performance:email` | Ejecuta K6 para EMAIL y guarda `summary-email.json` |
| `npm run test:performance:sms` | Ejecuta K6 para SMS y guarda `summary-sms.json` |
| `npm run test:smoke` | Ejecuta el flujo smoke de entrega |
| `npm run test:twilio` | Envia un SMS real usando las credenciales de `.env` |
| `npm run sonar` | Ejecuta el analisis Sonar |

## Testing

Las pruebas unitarias replican las capas de `src/` y usan mocks para
PostgreSQL, Redis y proveedores externos. No requieren servicios reales.

```bash
npm test
npm run coverage
```

El umbral configurado es `85%` para lineas, funciones, ramas y statements. La
suite tambien valida el contrato OpenAPI 3.1 y su cobertura de rutas.

La prueba K6 valida `p95 < 500 ms`, tasa de errores menor al `1%` y throughput
configurable. Requiere una plantilla EMAIL o SMS con las variables `nombre` y
`pedido`; su identificador y canal se pasan mediante `TEMPLATE_ID` y `CHANNEL`:

```powershell
$env:BASE_URL = "http://localhost:3050"
$env:TEMPLATE_ID = "1"
$env:CHANNEL = "EMAIL"
$env:SERVICE_API_KEY = "replace-with-your-service-api-key"
$env:RATE = "10"
$env:DURATION = "1m"
npm run test:performance
```

La guia completa esta en `test/performance/README.md`. El resumen JSON se
escribe en `docs/evidencias/k6/summary.json` y puede publicarse como artefacto
del pipeline.

El smoke test necesita PostgreSQL, Redis y el proveedor SMS simulado:

```bash
npm run test:smoke
```

La prueba Twilio es opt-in, tiene costo y envia exactamente un SMS al numero
definido en `TWILIO_TEST_TO`:

```bash
npm run test:twilio
```


para recrear todo


```bash
docker compose down --volumes --remove-orphans
docker compose build --no-cache api worker
docker compose up -d --force-recreate db redis api worker
```

## Observabilidad y seguridad

- `GET /metrics` expone metricas compatibles con Prometheus.
- `@tigo/logger` registra requests, responses y tiempos de controllers.
- Helmet deshabilita `x-powered-by`, aplica `nosniff` y una CSP restrictiva.
- Las rutas de negocio requieren `X-API-Key`, comparada mediante un hash SHA-256
  y `timingSafeEqual`; la clave se obtiene exclusivamente del entorno.
- Swagger usa una CSP propia limitada a `/docs`; no relaja la politica del API.
- Las respuestas usan `Cache-Control: no-store` y `Pragma: no-cache`.
- El Dockerfile ejecuta el proceso con un usuario sin privilegios e incorpora
  instrumentacion OpenTelemetry.
- `SIGINT` y `SIGTERM` realizan un apagado ordenado de API, worker, BullMQ,
  Redis y PostgreSQL.


-..
