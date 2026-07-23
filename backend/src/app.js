import ultimateExpress from 'ultimate-express';
import promBundle from 'express-prom-bundle';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import routerRoutes from './routes/router.routes.js';
import bodyParser from 'body-parser';
import { httpLoggerMiddleware } from '@tigo/logger';
import openapiDocument from './openapi/openapi.document.js';
import { apiKeyMiddleware } from './middleware/api-key.middleware.js';
import config from './utils/config.js';
const app = ultimateExpress({ threads: 0 });

app.use(helmet());
const metricsMiddleware = promBundle({ includeMethod: true });

app.disable('x-powered-by');
app.use(bodyParser.json());

app.use(httpLoggerMiddleware());
app.use(metricsMiddleware);

app.use(helmet.noSniff());

app.use(
  helmet.contentSecurityPolicy({
    useDefaults: true,
    directives: {
      defaultSrc: ['\'none\''],
      scriptSrc: ['\'none\''],
      styleSrc: ['\'none\''],
      objectSrc: ['\'none\''],
      baseUri: ['\'none\''],
      frameAncestors: ['\'none\'']
    }
  })
);

app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
});

app.get('/openapi.json', (req, res) => res.status(200).json(openapiDocument));

const docsContentSecurityPolicy = helmet.contentSecurityPolicy({
  useDefaults: false,
  directives: {
    defaultSrc: ['\'none\''],
    scriptSrc: ['\'self\'', '\'unsafe-inline\''],
    styleSrc: ['\'self\'', '\'unsafe-inline\''],
    imgSrc: ['\'self\'', 'data:'],
    fontSrc: ['\'self\'', 'data:'],
    connectSrc: ['\'self\''],
    objectSrc: ['\'none\''],
    baseUri: ['\'self\''],
    frameAncestors: ['\'none\'']
  }
});

app.use(
  '/docs',
  docsContentSecurityPolicy,
  ...swaggerUi.serve,
  swaggerUi.setup(openapiDocument, {
    customSiteTitle: 'P07 - API de notificaciones',
    swaggerOptions: {
      displayRequestDuration: true,
      persistAuthorization: false,
      tryItOutEnabled: true
    }
  })
);

app.use(config.API_BASE_PATH, apiKeyMiddleware);
app.use(config.API_BASE_PATH, routerRoutes);

export default app;
