# Prueba de rendimiento K6

Este escenario mide la aceptacion asincrona de notificaciones mediante
`POST /api/v1/notifications` y falla si no se cumplen estos criterios:

- p95 menor a 500 ms.
- Tasa de solicitudes HTTP fallidas menor al 1%.
- Mas del 99% de los checks funcionales exitosos.
- Ninguna iteracion descartada por falta de VUs.

## Preparacion

La API y PostgreSQL deben estar disponibles. Para medir solamente la API no se
debe iniciar el worker, evitando entregas reales durante la prueba.

Todas las pruebas requieren la misma `SERVICE_API_KEY` configurada en el
archivo `backend/.env`. K6 no carga ese archivo automaticamente. Desde una
terminal ubicada en `backend`, ejecutar una vez lo siguiente para copiar la
clave a la sesion actual de PowerShell sin imprimirla:

```powershell
$apiKeyLine = Get-Content .env |
    Where-Object { $_ -match '^\s*SERVICE_API_KEY\s*=' } |
    Select-Object -First 1

if (-not $apiKeyLine) {
    throw "No se encontro SERVICE_API_KEY en backend/.env"
}

$env:SERVICE_API_KEY = (
    $apiKeyLine -replace '^\s*SERVICE_API_KEY\s*=\s*', ''
).Trim().Trim('"').Trim("'")

if ($env:SERVICE_API_KEY.Length -lt 32) {
    throw "SERVICE_API_KEY debe tener al menos 32 caracteres"
}

$headers = @{ "X-API-Key" = $env:SERVICE_API_KEY }
```

## Prueba de notificaciones SMS

El k6 actual mide solamente la aceptacion de la notificacion por la API. Si el
worker esta apagado, no es necesario levantar el mock SMS.

Si tambien se inicia el worker para observar la entrega, levantar el mock en
otra terminal:

```powershell
npm run dev:sms-mock
```

En la terminal donde se cargaron `$env:SERVICE_API_KEY` y `$headers`, crear una
plantilla SMS:

```powershell
$templateBody = @{
    nombre = "performance-sms-$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
    canal = "SMS"
    contenido = "Hola {{nombre}}, pedido {{pedido}}."
    variables = @("nombre", "pedido")
} | ConvertTo-Json

$template = Invoke-RestMethod `
    -Method Post `
    -Uri "http://127.0.0.1:3050/api/v1/templates" `
    -Headers $headers `
    -ContentType "application/json" `
    -Body $templateBody

$template
```

El valor de `$template.id` se asigna automaticamente a `TEMPLATE_ID`; no es
necesario copiar ni escribir manualmente un ID como `806`:

```powershell
$env:BASE_URL = "http://localhost:3050"
$env:TEMPLATE_ID = "808"
$env:CHANNEL = "SMS"
$env:DESTINATION = "+59170000000"
$env:RATE = "10"
$env:DURATION = "1m"
$env:PRE_ALLOCATED_VUS = "20"
$env:MAX_VUS = "100"

$env:K6_WEB_DASHBOARD = 'true'
$env:K6_WEB_DASHBOARD_PORT = '-1'
$env:K6_WEB_DASHBOARD_EXPORT = 'docs/evidencias/k6/7.1_reporte_notificaiones_sms_k6.html'
npm run test:performance:sms
```



## Ejecucion SMS en Bash

En Bash tambien se debe exportar la misma clave configurada en el `.env`:

```bash
export SERVICE_API_KEY="la-misma-clave-configurada-en-backend-env"
export BASE_URL="http://localhost:3050"
export TEMPLATE_ID="1"
export CHANNEL="SMS"
export DESTINATION="+59170000000"
export RATE="10"
export DURATION="1m"
export PRE_ALLOCATED_VUS="20"
export MAX_VUS="100"

npm run test:performance:sms
```

`RATE` representa solicitudes por segundo. Los reportes se guardan como
`docs/evidencias/k6/summary-email.json` y `summary-sms.json`. K6 termina con un
codigo distinto de cero si falla cualquier threshold, por lo que el comando se
puede usar como gate de CI.

Ejecutar la prueba contra una base de datos exclusiva de performance porque
cada iteracion crea una notificacion persistente.





## RF-7.3 - Consultar estado de envio

La notificacion debe existir antes de iniciar la prueba. `EXPECTED_STATUS` es
opcional; cuando se informa, la prueba tambien verifica que el estado no cambie
respecto de `ENCOLADA`, `ENVIADA` o `FALLIDA`.

```powershell
$env:BASE_URL = "http://localhost:3050"
$env:NOTIFICATION_ID = "42"
$env:EXPECTED_STATUS = "ENVIADA"
$env:RATE = "10"
$env:DURATION = "1m"

$env:K6_WEB_DASHBOARD = 'true'
$env:K6_WEB_DASHBOARD_PORT = '-1'
$env:K6_WEB_DASHBOARD_EXPORT = 'docs/evidencias/k6/7.1_reporte_estado_notificacion_k6.html'
npm run test:performance:status
```

## RF-7.2 - Gestionar plantillas

Cada iteracion crea una plantilla con nombre unico, comprueba que repetir el
nombre en el mismo canal devuelve 409, actualiza la plantilla y finalmente la
elimina. `RATE` representa flujos CRUD por segundo; cada flujo realiza cuatro
solicitudes HTTP.

```powershell
$env:BASE_URL = "http://localhost:3050"
$env:CHANNEL = "EMAIL"
$env:RATE = "2"
$env:DURATION = "1m"
$env:K6_WEB_DASHBOARD = 'true'
$env:K6_WEB_DASHBOARD_PORT = '-1'
$env:K6_WEB_DASHBOARD_EXPORT = 'docs/evidencias/k6/7.1_reporte_gestionar_plantilla_k6.html'
npm run test:performance:templates
```

## RF-7.5 - Listar historial

El escenario valida los filtros por canal y estado, el limite de resultados y
los metadatos de paginacion. Una pagina vacia tambien es una respuesta valida;
para medir una consulta representativa se recomienda precargar notificaciones.

```powershell
$env:BASE_URL = "http://localhost:3050"
$env:CHANNEL = "SMS"
$env:STATUS = "ENVIADA"
$env:PAGE = "1"
$env:LIMIT = "20"
$env:RATE = "10"
$env:DURATION = "1m"

$env:K6_WEB_DASHBOARD = 'true'
$env:K6_WEB_DASHBOARD_PORT = '-1'
$env:K6_WEB_DASHBOARD_EXPORT = 'docs/evidencias/k6/7.1_reporte_historial_notificaciones_k6.html'
npm run test:performance:history
```

