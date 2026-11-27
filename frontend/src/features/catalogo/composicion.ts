import { getCatalogService } from '../../services/servicio-catalogo';
import { createHttpCatalogRepository } from './datos/repositorio-http';
import type { CatalogRepository } from './dominio/repositorio-catalogo';

// One lazy repository per application runtime; tests create their own independent scopes.
// Only the stateless transport adapter is shared, never screen state or observers.
export function createCatalogScope(build: () => CatalogRepository) {
  let instance: CatalogRepository | undefined;
  return Object.freeze({
    getRepository(): CatalogRepository {
      return instance ??= build();
    },
  });
}

const applicationScope = createCatalogScope(() => {
  const mode = __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo' ? 'demo' : 'commercial';
  return createHttpCatalogRepository(getCatalogService(mode), mode);
});

export const getCatalogRepository = applicationScope.getRepository;
