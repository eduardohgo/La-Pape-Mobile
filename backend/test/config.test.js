import assert from 'node:assert/strict';
import test from 'node:test';
import { loadConfig } from '../src/config/env.js';
import { createDatabasePool } from '../src/db/pool.js';

test('defaults support a local HTTP base without database credentials', () => {
  const config = loadConfig({});
  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 3000);
  assert.equal(config.database, null);
  assert.deepEqual(config.allowedOrigins, ['http://localhost:8081', 'http://localhost:19006']);
});

test('invalid configuration fails without reflecting supplied values', () => {
  for (const env of [{ PORT: '123e2' }, { PORT: '0' }, { PORT: '65536' }, { HOST: 'invalid-host' }, { FRONTEND_ORIGINS: 'https://example.invalid/path' }, { DATABASE_URL: 'not-a-postgres-url' }]) {
    assert.throws(() => loadConfig(env), (error) => {
      for (const value of Object.values(env)) assert.ok(!error.message.includes(value));
      return true;
    });
  }
});

test('database TLS is verified for every remote host and production localhost', () => {
  for (const env of [
    { DATABASE_URL: 'postgresql://example.invalid/lapape' },
    { NODE_ENV: 'production', DATABASE_URL: 'postgresql://localhost/lapape' },
  ]) {
    assert.deepEqual(loadConfig(env).database.ssl, { rejectUnauthorized: true });
    assert.throws(() => loadConfig({ ...env, PG_SSL: 'false' }), /no puede desactivar TLS/);
  }
  assert.equal(loadConfig({ DATABASE_URL: 'postgresql://localhost/lapape' }).database.ssl, false);
  assert.deepEqual(loadConfig({ DATABASE_URL: 'postgresql://localhost/lapape', PG_SSL: 'true' }).database.ssl, { rejectUnauthorized: true });
});

test('URL parameters cannot override database TLS configuration', () => {
  for (const query of ['sslmode=disable', 'sslmode=require', 'sslrootcert=example', 'application_name=example']) {
    assert.throws(() => loadConfig({ DATABASE_URL: `postgresql://example.invalid/lapape?${query}` }), /sin parámetros/);
  }
});

test('PostgreSQL pool preparation creates no client and performs no query', async () => {
  let constructions = 0;
  let connects = 0;
  let queries = 0;
  class FakePool {
    constructor(config) {
      constructions += 1;
      this.options = config;
    }
    connect() { connects += 1; }
    query() { queries += 1; }
  }
  assert.equal(createDatabasePool(null, FakePool), null);
  const config = loadConfig({ DATABASE_URL: 'postgresql://example.invalid/lapape' });
  const fakePool = createDatabasePool(config.database, FakePool);
  assert.equal(fakePool.options, config.database);
  assert.equal(constructions, 1);
  assert.equal(connects, 0);
  assert.equal(queries, 0);

  const actualPool = createDatabasePool(config.database);
  assert.equal(actualPool.totalCount, 0);
  assert.equal(actualPool.idleCount, 0);
  await actualPool.end();
});
