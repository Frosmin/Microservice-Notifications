# Arquitectura P07 - Notificaciones

Diagramas PlantUML alineados con los requisitos RF-7.1 a RF-7.5 y con el
backend implementado mediante BullMQ, Redis, PostgreSQL y transactional outbox.

## Decisiones de arquitectura

- Los servicios internos usan `X-API-Key` en las operaciones protegidas bajo
  `/api/v1`; el middleware responde `401` si la clave falta o es inválida.
- La clave es un control técnico entre servicios. P07 no modela usuarios,
  roles, permisos ni autorización de negocio. Una configuración inválida de
  `SERVICE_API_KEY` responde `503`.
- `/api/v1/health`, `/metrics`, `/openapi.json` y `/docs` son públicos.
- Email usa Gmail SMTP mediante Nodemailer; SMS usa la API REST de Twilio
  mediante un adaptador HTTP propio.
- PostgreSQL es la fuente de verdad para plantillas, notificaciones,
  idempotencia, estados, intentos y eventos outbox.
- La API confirma `notificacion` y `notification_outbox` en una misma
  transacción y no depende de Redis para responder `202 Accepted`.
- El Outbox Publisher crea jobs BullMQ. Redis conserva únicamente información
  operativa de la cola, backoff y rate limiting.
- El worker entrega, registra intentos y deja a BullMQ programar los reintentos
  automáticos con backoff exponencial.
- `ENVIADA` significa que Gmail o Twilio aceptó la solicitud de envío; no
  confirma la recepción final por el destinatario.
- La entrega es al menos una vez. Job IDs estables, advisory locks, comprobación
  de `ENVIADA` y el `Message-ID` determinista de Gmail reducen duplicados sin
  afirmar exactly-once. Twilio devuelve un SID después de aceptar el SMS, pero
  no recibe una clave determinista de idempotencia del servicio.

## Diagramas

- C4: contexto, contenedores, componentes y vista de código/modelo.
- BP: envío, gestión de plantillas, consulta/historial y reintento manual.
- HLD: aceptación durable, publicación outbox y entrega end-to-end.
- LLD: API de notificaciones, entrega asíncrona y gestión de plantillas.

Cada fuente `.puml` bajo `diagrams/` tiene un PNG renderizado en el mismo
directorio. Esta correspondencia no incluye las librerías C4 vendorizadas bajo
`binariess/`. Los HLD y LLD se mantienen separados por responsabilidad para que
puedan leerse a escala normal durante una revisión o defensa.
