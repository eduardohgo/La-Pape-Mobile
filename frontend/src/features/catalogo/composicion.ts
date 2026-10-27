import { getApiConfig } from '../../config/configuracion-api';
import { createCatalogService } from '../../services/servicio-catalogo';
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

const applicationScope = createCatalogScope(() => createHttpCatalogRepository(
  createCatalogService(getApiConfig()),
  __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo' ? 'demo' : 'commercial',
));

export const getCatalogRepository = applicationScope.getRepository;
