import { Router } from 'express';
import { logFailure } from '../log-operativo.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PRODUCT_PARAMS = new Set(['categoryId', 'after', 'limit']);

function productFilters(url) {
  const start = url.indexOf('?');
  const filters = new Map();
  // Read the original pairs because Express's extended parser can reshape or discard keys.
  for (const [key, value] of new URLSearchParams(start === -1 ? '' : url.slice(start))) {
    if (!PRODUCT_PARAMS.has(key) || filters.has(key)) return null;
    filters.set(key, value);
  }

  const categoryId = filters.get('categoryId') ?? null;
  const after = filters.get('after') ?? null;
  const limit = filters.get('limit') ?? '20';
  const size = Number(limit);
  if ((categoryId !== null && !UUID.test(categoryId)) ||
      (after !== null && !UUID.test(after)) ||
      !/^[1-9][0-9]?$/.test(limit) || size > 50) return null;
  return { categoryId, after, size };
}

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
    const filters = productFilters(req.originalUrl);
    if (!filters) return res.status(400).json({ error: 'Parámetros inválidos' });
    const { categoryId, after, size } = filters;
    try {
      const rows = await repo.listProducts(categoryId, after, size);
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
