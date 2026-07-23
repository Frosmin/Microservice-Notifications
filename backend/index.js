import 'dotenv/config';
import { closeAllConnections, initializeDB } from '@tigo/postgres-connector';
import app from './src/app.js';
import { closeApiRuntime } from './src/runtime/shutdown.js';

const PORT = process.env.PORT || 3000;

// Inicializa el pool de conexiones a Postgres antes de aceptar trafico.
await initializeDB();

const server = app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});

let shuttingDown = false;
const shutdown = async (signal) => {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`${signal} received, closing API`);
  await closeApiRuntime({ server, closeDatabase: closeAllConnections });
};

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    shutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('API shutdown failed', error);
        process.exit(1);
      });
  });
}
