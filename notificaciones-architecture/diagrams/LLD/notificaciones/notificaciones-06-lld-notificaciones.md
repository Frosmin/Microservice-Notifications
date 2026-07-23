# LLD - Notificaciones

**Stack:** Node.js, ultimate-express, Zod, PostgreSQL, BullMQ y Redis

**API:** [notificaciones-06-lld-notificaciones.puml](notificaciones-06-lld-notificaciones.puml)

**Entrega asíncrona:** [notificaciones-08-lld-entrega-asincrona.puml](notificaciones-08-lld-entrega-asincrona.puml)

Las operaciones protegidas bajo `/api/v1` requieren `X-API-Key`. Este es un
control técnico entre servicios; P07 no modela usuarios, roles ni permisos de
negocio. `/api/v1/health`, `/metrics`, `/openapi.json` y `/docs` son públicos.

## Endpoints

| Método | Ruta | Resultado principal |
|---|---|---|
| `POST` | `/api/v1/notifications` | Crea una solicitud durable en `ENCOLADA`. Devuelve `202`, `200` para repetición idempotente idéntica o `409` para payload distinto. |
| `GET` | `/api/v1/notifications/{id}` | Devuelve el recurso y `historialIntentos` ordenado. |
| `GET` | `/api/v1/notifications?canal&estado&page&limit` | Devuelve historial filtrado y paginado. |
| `POST` | `/api/v1/notifications/{id}/retry` | Programa un reintento de una notificación `FALLIDA`. |

Si `X-API-Key` falta o es inválida se responde `401`. Si `SERVICE_API_KEY` está
ausente o es demasiado corta, se responde `503` antes de ejecutar el caso de
uso.

## Persistencia y transactional outbox

PostgreSQL es la fuente de verdad. `insertNotification` crea `notificacion` y
`notification_outbox` dentro de una misma transacción. Por ello, la API puede
responder `202 Accepted` después del `COMMIT` aunque Redis esté temporalmente
inaccesible; no elimina la notificación ni devuelve `503` por un fallo posterior
de publicación.

El Outbox Publisher reclama eventos pendientes mediante
`FOR UPDATE SKIP LOCKED`, crea jobs BullMQ con `jobId = outbox-{id}` y marca el
evento como publicado. Si Redis falla, incrementa `publish_attempts`, conserva
el error y mueve `available_at` aplicando backoff.

## Entrega y reintentos

El BullMQ Worker aplica concurrencia y un límite de envíos por minuto. Antes de
entregar obtiene un advisory lock PostgreSQL por notificación, vuelve a consultar
su estado y omite una notificación que ya esté `ENVIADA`.

Cada invocación al proveedor produce una fila `intento` e incrementa el contador
de la notificación. Los fallos transitorios mantienen `ENCOLADA` y BullMQ
programa el siguiente intento con backoff exponencial. Un error permanente o el
último intento cambia el estado a `FALLIDA`.

Cuando Gmail o Twilio acepta la solicitud, el intento queda `EXITOSO` y la
notificación pasa a `ENVIADA`. Este estado registra la aceptación del proveedor;
no confirma la entrega final al destinatario.

El reintento manual bloquea la fila con `SELECT FOR UPDATE`; si la notificación
está `FALLIDA` y quedan intentos, actualiza a `ENCOLADA` y crea otro evento outbox
diferido en la misma transacción. Solicitudes concurrentes quedan serializadas y
una segunda solicitud observa `ENCOLADA`, por lo que recibe `409`.

## Idempotencia y garantía de entrega

- `Idempotency-Key` es obligatorio y único en PostgreSQL.
- La misma clave y payload devuelve el recurso existente; otro payload devuelve `409`.
- El job ID estable evita duplicar un job para el mismo evento outbox.
- Advisory lock, estado `ENVIADA` y el `Message-ID` determinista de Gmail reducen duplicados.
- Twilio devuelve un SID después de aceptar el SMS, pero no recibe una clave determinista de idempotencia.
- La entrega es **al menos una vez**; no se promete exactly-once frente a una caída después de la aceptación del proveedor.
- Redis conserva jobs, demoras, reintentos y rate limiting de BullMQ, pero no estados, intentos ni idempotencia de negocio.

## Errores esperados

| HTTP | Uso |
|---|---|
| `401` | `X-API-Key` ausente o inválida en una operación protegida. |
| `400` | Body, header, filtros, paginación, id o variables inválidos. |
| `404` | Plantilla o notificación inexistente. |
| `409` | Idempotencia conflictiva o reintento no permitido. |
| `500` | Falla interna no esperada, incluidos actualmente los fallos de PostgreSQL sin tipificar. |
| `503` | `SERVICE_API_KEY` ausente o demasiado corta. |

No se define autorización por usuario ni respuestas `403`; la API key solo
controla el acceso técnico entre servicios.
