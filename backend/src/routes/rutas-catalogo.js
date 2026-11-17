import { Router } from 'express';
import { logFailure } from '../log-operativo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function unavailable(res) {
  logFailure('catalog_request_failed');
  return res.status(503).json({ error: 'Catálogo temporalmente no disponible' });
}

export function createCatalogRouter(repo) {
  const router = Router();
  router.get('/categories', async (_req, res) => {
    try { res.json({ data: await repo.listCategories() }); }
    catch { unavailable(res); }
  });
  router.get('/products', async (req, res) => {
    const { categoryId, after, limit = '20' } = req.query;
    if (Object.keys(req.query).some(k => !['categoryId', 'after', 'limit'].includes(k)) ||
      (categoryId !== undefined && (typeof categoryId !== 'string' || !UUID.test(categoryId))) ||
      (after !== undefined && (typeof after !== 'string' || !UUID.test(after))) ||
      typeof limit !== 'string' || !/^[1-9][0-9]?$/.test(limit) || Number(limit) > 50)
      return res.status(400).json({ error: 'Parámetros inválidos' });
    try {
      const size = Number(limit);
      const rows = await repo.listProducts(categoryId ?? null, after ?? null, size);
      const hasMore = rows.length > size;
      const data = rows.slice(0, size);
      return res.json({ data, page: { hasMore, nextCursor: hasMore ? data.at(-1)?.id ?? null : null } });
    } catch { return unavailable(res); }
  });
  router.get('/products/:id', async (req, res) => {
    if (!UUID.test(req.params.id)) return res.status(400).json({ error: 'Identificador inválido' });
    try {
      const product = await repo.getProduct(req.params.id);
      return product ? res.json({ data: product }) : res.status(404).json({ error: 'Producto no encontrado' });
    } catch { return unavailable(res); }
  });
  return router;
}
