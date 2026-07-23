# LLD - Gestión de Plantillas

**Stack:** Node.js, ultimate-express, Zod y PostgreSQL
**Diagrama:** [notificaciones-07-lld-plantillas.puml](notificaciones-07-lld-plantillas.puml)

El módulo administra las plantillas de email y SMS. Las operaciones protegidas
requieren `X-API-Key`; P07 valida la clave y los datos, pero no modela usuarios,
roles ni permisos de negocio. `/api/v1/health`, `/metrics`, `/openapi.json` y
`/docs` son públicos.

## Modelo

| Campo | Tipo | Regla |
|---|---|---|
| `id` | bigint | Identificador generado por PostgreSQL. |
| `nombre` | string | Obligatorio y único dentro del canal. |
| `canal` | `EMAIL` o `SMS` | Obligatorio. |
| `contenido` | string | Obligatorio y no vacío. |
| `variables` | string[] | Lista de variables requeridas; puede estar vacía. |

La base de datos garantiza la unicidad de `(nombre, canal)`.

## Endpoints

| Método | Ruta | Respuestas principales |
|---|---|---|
| `POST` | `/api/v1/templates` | `201`, `400`, `401`, `409` o `503`. |
| `PUT` | `/api/v1/templates/{id}` | `200`, `400`, `401`, `404`, `409` o `503`. |
| `DELETE` | `/api/v1/templates/{id}` | `204`, `400`, `401`, `404`, `409` o `503`. |

El borrado devuelve `409` cuando la plantilla existe pero tiene notificaciones
asociadas; PostgreSQL conserva la relación mediante `ON DELETE RESTRICT` y el
repositorio evita ejecutar el `DELETE` en ese caso.

`401` indica una `X-API-Key` ausente o inválida; `503` también puede indicar que
`SERVICE_API_KEY` no está configurada correctamente. No se define autorización
por usuario ni respuestas `403`.
