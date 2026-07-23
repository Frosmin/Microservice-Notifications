# Autenticacion en REST Client

Las rutas bajo `/api/v1` requieren el encabezado `X-API-Key`. La unica
excepcion es `/api/v1/health`.

## Postman

En la pestana **Authorization** configure:

- Type: `API Key`
- Key: `X-API-Key`
- Value: el valor de `SERVICE_API_KEY` definido en `backend/.env`
- Add to: `Header`

No use `Bearer Token` ni la contrasena SMTP (`SMTP_APP_PASSWORD`).

## REST Client

Los archivos `tc-01.http` a `tc-35.http` leen `SERVICE_API_KEY` directamente
desde un archivo `.env` ubicado en este mismo directorio:

```http
GET {{baseUrl}}/notifications
X-API-Key: {{$dotenv SERVICE_API_KEY}}
```

En Windows puede enlazarse el `.env` principal sin copiar secretos:

```powershell
New-Item -ItemType HardLink `
  -Path .\test\httpRequest\.env `
  -Target .\.env
```

Ejecute el comando desde el directorio `backend`. El archivo `.env` esta
ignorado por Git. Si el enlace ya existe, no es necesario recrearlo.

`tc-36.http` conserva intencionalmente una solicitud sin credencial y otra
con una clave incorrecta; ambas deben responder `401 Unauthorized`.
