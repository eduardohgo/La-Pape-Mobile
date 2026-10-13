import { Router } from 'express';

// Intentionally separate from the commercial /products API.
// Reachable only when NODE_ENV=development AND the explicit demo flag is on.
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDemoCatalogRouter(repository) {
  const router = Router();

  router.get('/demo/products', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    // The preview exposes only the ten reviewed source identities, never an arbitrary SQL filter.
    if (Object.keys(req.query).length !== 0) {
      return res.status(400).json({ error: 'Parámetros no admitidos en la demostración' });
    }
    try {
      const data = await repository.listDemoProducts();
      return res.json({ mode: 'demo', purchasable: false, data });
    } catch {
      return res.status(503).json({ error: 'Vista previa temporalmente no disponible' });
    }
  });

  router.get('/demo/products/:id', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!UUID.test(req.params.id) || Object.keys(req.query).length !== 0) {
      return res.status(400).json({ error: 'Identificador o parámetros inválidos' });
    }
    try {
      const product = await repository.getDemoProduct(req.params.id);
      if (!product) return res.status(404).json({ error: 'Producto de demostración no encontrado' });
      return res.json({ mode: 'demo', purchasable: false, data: product });
    } catch {
      return res.status(503).json({ error: 'Vista previa temporalmente no disponible' });
    }
  });

  return router;
}
