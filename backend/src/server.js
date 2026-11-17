import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { loadConfig } from './config/variables-entorno.js';
import { logFailure } from './log-operativo.js';

const shutdownDatabases = new WeakMap();

export function manageDatabaseShutdown(server, closeDatabases) {
  shutdownDatabases.set(server, closeDatabases);
  server.once('close', () => {
    void closeDatabases().catch(() => logFailure('database_shutdown_failed'));
  });
  return server;
}

function bind(app, config) {
  return manageDatabaseShutdown(app.listen(config.port, config.host), app.locals.closeDatabases);
}

export function startServer(config = loadConfig(), dependencies) {
  if (config.runtime === 'render') throw new Error('Render requiere verificar PostgreSQL antes de escuchar');
  return bind(createApp(config, dependencies), config);
}

export async function startConfiguredServer(config, dependencies) {
  if (config.runtime !== 'render') return startServer(config, dependencies);
  const app = createApp(config, dependencies);
  try {
    await app.locals.verifyDatabases();
    return bind(app, config);
  } catch {
    await app.locals.closeDatabases().catch(() => logFailure('database_shutdown_failed'));
    throw new Error('Comprobación de arranque rechazada');
  }
}

const stopPromises = new WeakMap();

export function stopServer(server) {
  if (stopPromises.has(server)) return stopPromises.get(server);
  const stopping = new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
    server.closeIdleConnections();
  }).finally(() => shutdownDatabases.get(server)?.());
  stopPromises.set(server, stopping);
  return stopping;
}

export function handleServerSignals(server) {
  const shutdown = async () => {
    if (stopPromises.has(server)) return;
    const deadline = setTimeout(() => server.closeAllConnections(), 5000);
    deadline.unref();
    try {
      await stopServer(server);
    } catch {
      logFailure('server_shutdown_failed');
      process.exitCode = 1;
    } finally {
      clearTimeout(deadline);
    }
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
  server.once('close', () => {
    process.off('SIGINT', shutdown);
    process.off('SIGTERM', shutdown);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let server;
  try {
    const config = loadConfig();
    server = await startConfiguredServer(config);
    server.once('listening', () => console.log(`API escuchando en ${config.host}:${config.port}`));
    server.once('error', () => {
      logFailure('http_listen_failed');
      process.exitCode = 1;
      void shutdownDatabases.get(server)?.().catch(() => logFailure('database_shutdown_failed'));
    });
    handleServerSignals(server);
  } catch {
    logFailure('server_startup_rejected');
    process.exitCode = 1;
  }
}
