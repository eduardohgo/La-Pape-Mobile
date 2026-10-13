import { Router } from 'express';

// Intentionally separate from the commercial /products API.
// Reachable only when NODE_ENV=development AND the explicit demo flag is on.
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

  return router;
}
