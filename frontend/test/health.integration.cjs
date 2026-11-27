const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');
const { createHttpClient } = require('../.test-build/services/http/cliente-http.js');
const { parseApiConfig } = require('../.test-build/config/configuracion-api.js');
const { isHealthResponse } = require('../.test-build/services/servicio-salud-api.js');

test('TypeScript client consumes real local Express health without a database', async () => {
  const { createApp } = await import('../../backend/src/app.js');
  const { loadConfig } = await import('../../backend/src/config/variables-entorno.js');
  const { stopServer } = await import('../../backend/src/server.js');
  const server = createApp(loadConfig({})).listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const config = parseApiConfig({ url: `http://127.0.0.1:${server.address().port}` }, true);
    const result = await createHttpClient(config).get('/health', isHealthResponse);
    assert.equal(result.ok, true);
  } finally { await stopServer(server); }
});
