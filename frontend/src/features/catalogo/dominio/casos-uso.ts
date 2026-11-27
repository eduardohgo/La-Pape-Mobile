import { ProductNotFoundError } from './modelos';
import type { CatalogRepository } from './repositorio-catalogo';

export async function loadCatalog(repository: CatalogRepository, signal: AbortSignal) {
  signal.throwIfAborted();
  const data = await repository.list(signal);
  signal.throwIfAborted();
  return {
    products: Object.freeze(data.products.map(product => Object.freeze({ ...product }))),
    categories: Object.freeze(data.categories.map(category => Object.freeze({ ...category }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))),
  };
}

export async function loadProduct(repository: CatalogRepository, id: string, signal: AbortSignal) {
  signal.throwIfAborted();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ProductNotFoundError();
  }
  const product = await repository.detail(id, signal);
  signal.throwIfAborted();
  return { product: Object.freeze({ ...product }) };
}
