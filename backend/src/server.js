import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/env.js';

export function startServer(config = loadConfig()) {
  const app = createApp(config);
  return app.listen(config.port, config.host);
}

export function stopServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let server;
  try {
    const config = loadConfig();
    server = startServer(config);
    server.once('listening', () => console.log(`API local escuchando en ${config.host}:${config.port}`));
    server.once('error', () => {
      console.error('No se pudo iniciar el servidor HTTP');
      process.exitCode = 1;
    });
  } catch {
    console.error('No se pudo iniciar la API: revisa la configuración de entorno');
    process.exitCode = 1;
  }

  if (server) {
    let stopping = false;
    const shutdown = async () => {
      if (stopping) return;
      stopping = true;
      const timer = setTimeout(() => {
        server.closeAllConnections();
      }, 5000);
      timer.unref();
      try {
        await stopServer(server);
      } catch {
        process.exitCode = 1;
      } finally {
        clearTimeout(timer);
      }
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  }
}
