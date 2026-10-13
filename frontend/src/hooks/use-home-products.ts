import { useEffect, useState } from 'react';

import { type CatalogProduct, type DemoCatalogProduct, getCatalogService } from '@/services/catalog.service';

export type HomeProduct = CatalogProduct | DemoCatalogProduct;
export const homeDemoMode = __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo';

type HomeProductsState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; products: HomeProduct[] };

export function useHomeProducts() {
  const [reload, setReload] = useState(0);
  const [resolved, setResolved] = useState<{ key: number; state: HomeProductsState } | null>(null);
  const state: HomeProductsState = resolved?.key === reload ? resolved.state : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const service = getCatalogService();
        const products = homeDemoMode
          ? await service.demoProducts({ signal: controller.signal })
          : await service.products({ signal: controller.signal });
        if (!controller.signal.aborted) {
          setResolved({ key: reload, state: { status: 'loaded', products: products.slice(0, 4) } });
        }
      } catch {
        if (!controller.signal.aborted) setResolved({ key: reload, state: { status: 'error' } });
      }
    }
    void load();
    return () => controller.abort();
  }, [reload]);

  return { state, retry: () => setReload((value) => value + 1) };
}
