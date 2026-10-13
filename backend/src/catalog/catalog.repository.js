import { readFileSync } from 'node:fs';
import { Pool } from 'pg';

const categoriesSql = readFileSync(new URL('../../db/queries/categories.sql', import.meta.url), 'utf8');
const productsSql = readFileSync(new URL('../../db/queries/products-list.sql', import.meta.url), 'utf8');
const detailSql = readFileSync(new URL('../../db/queries/product-detail.sql', import.meta.url), 'utf8');
const demoSql = readFileSync(new URL('../../db/queries/demo-products.sql', import.meta.url), 'utf8');

export function createCatalogRepository(config, PoolClass = Pool) {
  if (!config) throw new Error('DATABASE_URL requerida para catálogo');
  const pool = new PoolClass(config);
  async function read(sql, params = []) {
    const client = await pool.connect();
    let started = false;
    try {
      await client.query('BEGIN READ ONLY');
      started = true;
      await client.query("SET LOCAL statement_timeout = '5s'");
      const result = await client.query(sql, params);
      await client.query('COMMIT');
      started = false;
      return result.rows;
    } catch (err) {
      if (started) { try { await client.query('ROLLBACK'); } catch { /* original error retained */ } }
      throw err;
    } finally { client.release(); }
  }
  return {
    listDemoProducts: () => read(demoSql),
    listCategories: () => read(categoriesSql),
    listProducts: (categoryId, after, limit) => read(productsSql, [categoryId, after, limit]),
    getProduct: async id => (await read(detailSql, [id]))[0] ?? null,
    close: () => pool.end(),
  };
}
