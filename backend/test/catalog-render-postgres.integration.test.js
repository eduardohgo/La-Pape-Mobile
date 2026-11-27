import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join, basename, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { Pool } from 'pg';
import { loadConfig } from '../src/config/variables-entorno.js';
import { verifyRuntimePermissions } from '../src/db/permisos-runtime.js';
import { createCatalogRepository } from '../src/repositories/repositorio-catalogo.js';
import { startConfiguredServer, stopServer } from '../src/server.js';

const bin = process.env.AUTH_TEST_POSTGRES_BIN;
const openssl = process.env.CATALOG_TEST_OPENSSL;
const credential = () => randomBytes(32).toString('hex');

async function localPort() {
  const socket = createServer().listen(0, '127.0.0.1');
  await once(socket, 'listening');
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  return port;
}

test('production catalog queries and startup use the dedicated service login and reject excessive grants', {
  skip: !bin || !openssl,
  timeout: 120000,
}, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'lapape-catalog-render-'));
  const data = join(directory, 'data');
  const passwordFile = join(directory, 'password');
  const adminPassword = credential();
  const readerPassword = credential();
  const port = await localPort();
  const tool = (name, args, daemon = false) => execFileSync(join(bin, name + (process.platform === 'win32' ? '.exe' : '')), args, {
    timeout: 40000, windowsHide: true, stdio: daemon ? 'ignore' : ['ignore', 'pipe', 'pipe'],
  });

  let started = false;
  let bootstrap, admin, service, api;
  t.after(async () => {
    try {
      if (api?.listening) await stopServer(api);
      await Promise.all([service?.end(), admin?.end(), bootstrap?.end()]);
    } finally {
      if (started) tool('pg_ctl', ['stop', '-D', data, '-m', 'fast', '-w']);
      if (dirname(directory) === tmpdir() && basename(directory).startsWith('lapape-catalog-render-')) {
        await rm(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 150 });
      }
    }
  });
  await writeFile(passwordFile, adminPassword + '\n', { mode: 0o600, flag: 'wx' });
  tool('initdb', ['-D', data, '-U', 'postgres', '--auth=scram-sha-256', '--pwfile=' + passwordFile, '--no-locale', '--encoding=UTF8']);
  await rm(passwordFile);
  const runSsl = (args) => execFileSync(openssl, args, { cwd: data, stdio: 'pipe', windowsHide: true, timeout: 10000 });
  runSsl(['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-sha256', '-days', '1',
    '-subj', '/CN=La Pape temporary test CA', '-keyout', 'test-ca.key', '-out', 'test-ca.crt',
    '-addext', 'basicConstraints=critical,CA:TRUE']);
  runSsl(['req', '-new', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost',
    '-keyout', 'server.key', '-out', 'server.csr']);
  await writeFile(join(data, 'server.ext'), 'subjectAltName=DNS:localhost\nextendedKeyUsage=serverAuth\n', { flag: 'wx' });
  runSsl(['x509', '-req', '-in', 'server.csr', '-CA', 'test-ca.crt', '-CAkey', 'test-ca.key',
    '-CAcreateserial', '-out', 'server.crt', '-days', '1', '-sha256', '-extfile', 'server.ext']);
  started = true;
  tool('pg_ctl', ['start', '-D', data, '-l', join(directory, 'postgres.log'),
    '-o', '-h 127.0.0.1 -p ' + port + ' -c ssl=on', '-t', '15', '-w'], true);

  // This owner only initializes the disposable cluster. Every release check
  // uses the dedicated LOGIN and its inherited privileges.
  const ca = await readFile(join(data, 'test-ca.crt'), 'utf8');
  const transport = {
    host: '127.0.0.1', port, ssl: { ca, servername: 'localhost', rejectUnauthorized: true },
    connectionTimeoutMillis: 5000,
  };
  bootstrap = new Pool({ ...transport, database: 'postgres', user: 'postgres', password: adminPassword });
  await bootstrap.query('CREATE DATABASE lapape_mobile_dev');
  admin = new Pool({ ...transport, database: 'lapape_mobile_dev', user: 'postgres', password: adminPassword });
  await admin.query(await readFile(new URL('../db/migrations/001_catalog_schema.sql', import.meta.url), 'utf8'));
  await admin.query(`
    CREATE ROLE lapape_catalog_reader NOLOGIN;
    GRANT USAGE ON SCHEMA catalog TO lapape_catalog_reader;
    GRANT SELECT ON catalog.categories, catalog.brands, catalog.products TO lapape_catalog_reader;
    CREATE SCHEMA identity;
    CREATE TABLE identity.users(id uuid);
    CREATE SCHEMA audit;
    CREATE TABLE audit.events(id uuid);
    CREATE SCHEMA demo;
    CREATE TABLE demo.product_previews(id uuid);
    GRANT USAGE ON SCHEMA demo TO lapape_catalog_reader;
    GRANT SELECT ON demo.product_previews TO lapape_catalog_reader;
    CREATE ROLE lapape_render_catalog_select NOLOGIN;
    GRANT USAGE ON SCHEMA catalog TO lapape_render_catalog_select;
    GRANT SELECT ON catalog.categories, catalog.brands, catalog.products TO lapape_render_catalog_select;
    CREATE ROLE lapape_catalog_render LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
      PASSWORD '${readerPassword}';
    GRANT lapape_render_catalog_select TO lapape_catalog_render WITH INHERIT TRUE, SET FALSE, ADMIN FALSE;
  `);
  const product = 'f8363b95-a65b-4f52-bcd1-dc076e484a22';
  const category = '6130746f-561d-45cd-98e2-7b3514ddbb7d';
  const brand = '7b1745ff-08f3-499b-9304-94077fd49303';
  await admin.query('INSERT INTO catalog.categories(id,name,is_active) VALUES ($1,$2,true)', [category, 'Cuadernos']);
  await admin.query('INSERT INTO catalog.brands(id,name) VALUES ($1,$2)', [brand, 'Editorial']);
  await admin.query(`
    INSERT INTO catalog.products(id,sku,name,description,category_id,brand_id,price,is_published,reviewed_at)
    VALUES ($1,'TEST-01','Cuaderno','Cuaderno de prueba',$2,$3,42.75,true,now())
  `, [product, category, brand]);

  const options = { ...transport, database: 'lapape_mobile_dev', user: 'lapape_catalog_render', password: readerPassword };
  service = new Pool(options);
  const { rows: [connection] } = await service.query(`
    SELECT current_user AS role, ssl FROM pg_catalog.pg_stat_ssl WHERE pid = pg_backend_pid()
  `);
  assert.deepEqual(connection, { role: options.user, ssl: true });
  for (const ssl of [{ rejectUnauthorized: true }, { ...options.ssl, servername: 'wrong-host.test' }]) {
    const rejected = new Pool({ ...options, ssl });
    try {
      await assert.rejects(rejected.query('SELECT 1'), (error) =>
        ['UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'SELF_SIGNED_CERT_IN_CHAIN', 'ERR_TLS_CERT_ALTNAME_INVALID'].includes(error.code));
    } finally {
      await rejected.end();
    }
  }
  for (const table of ['categories', 'brands', 'products']) {
    assert.equal((await service.query('SELECT count(*)::int AS count FROM catalog.' + table)).rows[0].count, 1);
  }
  await assert.rejects(service.query('SET ROLE lapape_render_catalog_select'), { code: '42501' });
  await assert.rejects(service.query('SET ROLE lapape_catalog_reader'), { code: '42501' });
  await assert.rejects(service.query('SELECT id FROM identity.users LIMIT 0'), { code: '42501' });
  await assert.rejects(service.query('SELECT id FROM demo.product_previews LIMIT 0'), { code: '42501' });
  await assert.rejects(service.query('SELECT id FROM audit.events LIMIT 0'), { code: '42501' });
  await assert.rejects(service.query('UPDATE catalog.products SET price=10 WHERE false'), { code: '42501' });
  await assert.rejects(service.query('DELETE FROM catalog.products WHERE false'), { code: '42501' });
  const { rows: [privileges] } = await service.query(`
    SELECT has_table_privilege('catalog.products','INSERT, UPDATE, DELETE') AS write,
      has_schema_privilege('catalog','CREATE') AS ddl,
      has_schema_privilege('identity','USAGE') AS identity
  `);
  assert.deepEqual(privileges, { write: false, ddl: false, identity: false });
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), true);
  await admin.query('GRANT USAGE ON SCHEMA demo TO PUBLIC');
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), false);
  await admin.query('REVOKE USAGE ON SCHEMA demo FROM PUBLIC');
  await admin.query('GRANT lapape_catalog_reader TO lapape_render_catalog_select WITH SET FALSE');
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), false);
  await admin.query('REVOKE lapape_catalog_reader FROM lapape_render_catalog_select');
  await admin.query('CREATE TABLE public.test_owned (id int)');
  await admin.query('ALTER TABLE public.test_owned OWNER TO lapape_catalog_render');
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), false);
  await admin.query('ALTER TABLE public.test_owned OWNER TO postgres');
  await admin.query('GRANT UPDATE (description) ON catalog.products TO lapape_catalog_render');
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), false);
  await admin.query('REVOKE UPDATE (description) ON catalog.products FROM lapape_catalog_render');
  await admin.query('GRANT lapape_render_catalog_select TO lapape_catalog_render WITH SET TRUE');
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), false);
  await admin.query('GRANT lapape_render_catalog_select TO lapape_catalog_render WITH SET FALSE');
  await admin.query('GRANT lapape_render_catalog_select TO lapape_catalog_render WITH ADMIN TRUE');
  assert.equal(await verifyRuntimePermissions(service, 'catalog'), false);
  await admin.query('GRANT lapape_render_catalog_select TO lapape_catalog_render WITH ADMIN FALSE');

  const config = loadConfig({
    NODE_ENV: 'production', APP_RUNTIME: 'render', PORT: '10000',
    CATALOG_API_ENABLED: 'true', AUTH_ENABLED: 'false',
    DATABASE_URL: 'postgresql://lapape_catalog_render:fixture@ep-catalog.region.aws.neon.tech/lapape_mobile_dev?sslmode=verify-full',
  });
  assert.equal(config.database.ssl.rejectUnauthorized, true);
  api = await startConfiguredServer({ ...config, port: 0 }, { catalogRepository: createCatalogRepository(options) });
  if (!api.listening) await once(api, 'listening');
  const url = 'http://127.0.0.1:' + api.address().port;
  assert.equal((await fetch(url + '/health')).status, 200);
  assert.equal((await (await fetch(url + '/categories')).json()).data[0].id, category);
  assert.equal((await (await fetch(url + '/products')).json()).data[0].id, product);
  assert.equal((await (await fetch(url + '/products/' + product)).json()).data.price, '42.75');
  assert.equal((await fetch(url + '/auth/login', { method: 'POST' })).status, 404);
  assert.equal((await fetch(url + '/demo/products')).status, 404);
});
