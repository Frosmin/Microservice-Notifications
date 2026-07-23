# FROM node:22.22.1-trixie-slim

# # Configuración de zona horaria sin instalar paquetes extra
# ENV TZ=America/La_Paz
# ENV APP_HOME=/app
# WORKDIR $APP_HOME

# # Instalar/Elimina dependencias necesarias en una sola capa
# # NOTA: instala python solo si lo necesitas para instalar por ejemplo, con canvas
# RUN apt-get update && apt-get install -y --no-install-recommends python3 \
#   && apt-get purge -y \
#     libpam-modules \
#     libpam-modules-bin \
#     libpam-runtime \
#     libpam0g \
#   || true \
#   && apt-get autoremove -y \
#   && apt-get clean \
#   && rm -rf /var/lib/apt/lists/*


# RUN addgroup --system app-group \
#     && adduser --system --ingroup app-group --home $APP_HOME --shell /usr/sbin/nologin usr-app
# # Copiar package.json y package-lock.json antes para aprovechar caché
# COPY package*.json ./

# # Instalar dependencias de producción de manera optimizada
# RUN npm ci --verbose --omit=dev

# RUN npm install --omit=dev --no-save @opentelemetry/sdk-node \
#   @opentelemetry/api \
#   @opentelemetry/auto-instrumentations-node \
#   @opentelemetry/sdk-metrics \
#   @opentelemetry/sdk-trace-node \
#   @opentelemetry/exporter-trace-otlp-grpc \
#   @opentelemetry/exporter-metrics-otlp-grpc \
#   @opentelemetry/resource-detector-container \
#   @opentelemetry/resources \
#   @opentelemetry/api-metrics

# # Copiar el resto del código
# COPY . .

# RUN printf "import { NodeSDK } from '@opentelemetry/sdk-node';\n\
# import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-grpc';\n\
# import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';\n\
# \n\
# const traceExporter = new OTLPTraceExporter({\n\
#   url: 'grpc://alloy.alloy.svc.cluster.local:4317',\n\
# });\n\
# \n\
# const sdk = new NodeSDK({\n\
#   traceExporter,\n\
#   instrumentations: [getNodeAutoInstrumentations()],\n\
# });\n\
# \n\
# sdk.start();\n" > opentelemetry.js

# # Elimina python y sus dependencias una vez utilizado
# RUN apt-get purge -y python3 \
#   && apt-get autoremove -y \
#   && apt-get clean

# # Eliminar npm/npx, ya no se lo necesita
# RUN rm -rf /usr/local/lib/node_modules/npm \
#     /usr/local/bin/npm \
#     /usr/local/bin/npx

# RUN chown -R usr-app:app-group $APP_HOME
# USER usr-app

# ENV PORT=3000
# EXPOSE $PORT

# # Comando de ejecución
# CMD [ "node", "--require", "./opentelemetry.js", "./index.js" ]

###########################################################################################################################################################################################################################################################

# #Offline 

# FROM node:22-alpine3.22

# ENV TZ=America/La_Paz
# ENV APP_HOME=/app
# ENV NODE_ENV=production

# WORKDIR $APP_HOME

# RUN apk upgrade --no-cache

# # Build local/offline:
# # Los paquetes @tigo/* se resuelven desde el registry privado de Tigo.
# # En el entorno local sin VPN/DNS corporativo, la imagen usa node_modules ya
# # instalados en la maquina para permitir build y scan Trivy sin descargar paquetes.
# COPY package*.json ./
# COPY node_modules ./node_modules
# COPY index.js ./
# COPY schemas ./schemas
# COPY src ./src

# RUN addgroup -S app-group \
#     && adduser -S -G app-group -h $APP_HOME -s /sbin/nologin usr-app \
#     && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
#     && chown -R usr-app:app-group $APP_HOME

# USER usr-app

# ENV PORT=3000
# EXPOSE $PORT

# CMD ["node", "./index.js"]





FROM node:22.22.1-bookworm-slim

ENV TZ=America/La_Paz
ENV APP_HOME=/app
ENV NODE_ENV=production

WORKDIR $APP_HOME


COPY package*.json ./
COPY node_modules ./node_modules


COPY index.js worker.js ./
COPY schemas ./schemas
COPY src ./src
COPY docs/openapi.json ./docs/openapi.json
COPY dev ./dev


RUN npm prune --omit=dev --offline --ignore-scripts \
    && addgroup --system app-group \
    && adduser --system --ingroup app-group --home $APP_HOME --shell /usr/sbin/nologin usr-app \
    && rm -rf /usr/local/lib/node_modules/npm \
        /usr/local/bin/npm \
        /usr/local/bin/npx \
    && chown -R usr-app:app-group $APP_HOME

USER usr-app

ENV PORT=3000
EXPOSE 3000

CMD ["node", "./index.js"]
