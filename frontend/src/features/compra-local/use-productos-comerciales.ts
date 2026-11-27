import { useEffect, useState } from 'react';
import { getCatalogService, type CatalogProduct } from '../../services/servicio-catalogo';

type State = { status: 'loading' | 'error' | 'ready'; products: readonly CatalogProduct[] };
export function useCommercialProducts() {
  const [attempt, setAttempt] = useState(0);
  const [resolved, setResolved] = useState<{ attempt: number; state: State } | null>(null);
  const state: State = resolved?.attempt === attempt ? resolved.state : { status: 'loading', products: [] };
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const products = await getCatalogService('commercial').products({ signal: controller.signal });
        if (!controller.signal.aborted) setResolved({ attempt, state: { status: 'ready', products } });
      } catch {
        if (!controller.signal.aborted) setResolved({ attempt, state: { status: 'error', products: [] } });
      }
    }
    void load();
    return () => controller.abort();
  }, [attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
