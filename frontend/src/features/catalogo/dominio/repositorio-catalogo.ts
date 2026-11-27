import type { CatalogData, VisibleProductDetail } from './modelos';

// Domain port: no fetch, React, environment or HTTP error types.
export interface CatalogRepository {
  list(signal: AbortSignal): Promise<CatalogData>;
  detail(id: string, signal: AbortSignal): Promise<VisibleProductDetail>;
}
