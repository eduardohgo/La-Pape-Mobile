import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from 'pg';
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

test('Neon URL SSL options are translated before pg parses the connection string', () => {
  for (const mode of ['require', 'verify-full']) {
    const config = loadConfig({ DATABASE_URL: `postgresql://api_reader:fake%40password@ep-example-pooler.example.invalid/lapape_mobile_dev?sslmode=${mode}&channel_binding=prefer` }).database;
    assert.equal(new URL(config.connectionString).search, '');
    assert.deepEqual(config.ssl, { rejectUnauthorized: true });
    assert.equal(config.enableChannelBinding, true);

    // Constructing a Client parses pg's actual configuration without connecting.
    const client = new Client(config);
    assert.equal(client.host, 'ep-example-pooler.example.invalid');
    assert.equal(client.database, 'lapape_mobile_dev');
    assert.equal(client.password, 'fake@password');
    assert.equal(client.enableChannelBinding, true);
    assert.deepEqual(client.ssl, { rejectUnauthorized: true });
    assert.equal(client._connecting, false);
    assert.equal(client._connected, false);
  }
});

test('weak, unsupported, duplicated and override URL parameters are rejected', () => {
  for (const query of [
    'sslmode=disable', 'sslmode=allow', 'sslmode=prefer', 'sslmode=no-verify', 'sslmode=verify-ca',
    'sslmode=', 'sslrootcert=example', 'sslkey=example', 'sslcert=example', 'ssl=false',
    'uselibpqcompat=true', 'application_name=example', 'host=localhost', 'channel_binding=disable',
    'channel_binding=', 'sslmode=require&sslmode=verify-full', 'sslmode=require&sslmode=disable',
    'channel_binding=prefer&channel_binding=prefer', 'SSLMODE=require',
  ]) {
    assert.throws(() => loadConfig({ DATABASE_URL: `postgresql://example.invalid/lapape?${query}` }));
  }
});

test('channel binding require fails explicitly instead of silently downgrading', () => {
  assert.throws(() => loadConfig({ DATABASE_URL: 'postgresql://example.invalid/lapape?sslmode=require&channel_binding=require' }), /no garantiza channel_binding=require/);
});

test('explicit URL TLS and channel binding cannot be disabled even for local development', () => {
  for (const query of ['sslmode=require', 'sslmode=verify-full', 'channel_binding=prefer']) {
    const env = { DATABASE_URL: `postgresql://localhost/lapape?${query}` };
    assert.deepEqual(loadConfig(env).database.ssl, { rejectUnauthorized: true });
    assert.throws(() => loadConfig({ ...env, PG_SSL: 'false' }), /no puede desactivar TLS/);
  }
  assert.equal(loadConfig({ DATABASE_URL: 'postgresql://localhost/lapape' }).database.enableChannelBinding, false);
});

test('database configuration errors redact malformed credentials and URLs', () => {
  const values = [
    ...['?sslmode=disable', '?channel_binding=require', '?sslrootcert=secret-ca', '#fragment']
      .map((suffix) => `postgresql://sensitive-user:sensitive-password@example.invalid/lapape${suffix}`),
    'postgresql://sensitive-user:sensitive-password%ZZ@example.invalid/lapape',
  ];
  for (const value of values) {
    assert.throws(() => loadConfig({ DATABASE_URL: value }), (error) => {
      for (const secret of ['sensitive-user', 'sensitive-password', 'example.invalid', value]) {
        assert.ok(!error.message.includes(secret));
      }
      return true;
    });
  }
});

test('the migration owner URL is never used by runtime configuration', () => {
  assert.equal(loadConfig({ DATABASE_URL_UNPOOLED: 'not-a-runtime-url' }).database, null);
  const runtime = 'postgresql://api_reader@example.invalid/lapape';
  assert.equal(loadConfig({ DATABASE_URL: runtime, DATABASE_URL_UNPOOLED: 'not-a-runtime-url' }).database.connectionString, runtime);
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
