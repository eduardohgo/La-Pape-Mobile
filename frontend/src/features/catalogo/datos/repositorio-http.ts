import type { CatalogCategory } from '../dominio/modelos';
import { ProductNotFoundError } from '../dominio/modelos';
import type { CatalogRepository } from '../dominio/repositorio-catalogo';
import type { createCatalogService } from '../../../services/servicio-catalogo';
import { ApiError } from '../../../services/http/errores-http';

type CatalogService = ReturnType<typeof createCatalogService>;

// Factory + Repository adapter. The selected mode never falls back to another catalog.
export function createHttpCatalogRepository(service: CatalogService, mode: 'commercial' | 'demo'): CatalogRepository {
  return Object.freeze({
    async list(signal: AbortSignal) {
      if (mode === 'demo') {
        const products = await service.demoProducts({ signal });
        const categories = new Map<string, CatalogCategory>();
        for (const product of products) categories.set(product.category_id, {
          id: product.category_id, name: product.category_name, description: null,
        });
        return { products, categories: [...categories.values()] };
      }
      const [categories, products] = await Promise.all([
        service.categories({ signal }), service.products({ signal }),
      ]);
      return { categories, products };
    },
    async detail(id: string, signal: AbortSignal) {
      try {
        return mode === 'demo'
          ? await service.demoProduct(id, { signal })
          : await service.product(id, { signal });
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) throw new ProductNotFoundError();
        throw error;
      }
    },
  });
}
