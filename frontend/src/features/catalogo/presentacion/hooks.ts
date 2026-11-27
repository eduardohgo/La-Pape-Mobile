import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { getCatalogRepository } from '../composicion';
import { createCatalogViewModel, createProductDetailViewModel } from './viewmodels';

export function useCatalogViewModel() {
  const model = useMemo(() => createCatalogViewModel(getCatalogRepository), []);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getInitialSnapshot);
  useEffect(() => {
    void model.retry();
    return model.cancel;
  }, [model]);
  return { state, retry: model.retry };
}

export function useProductDetailViewModel(id: string) {
  const model = useMemo(() => createProductDetailViewModel(id, getCatalogRepository), [id]);
  const state = useSyncExternalStore(model.subscribe, model.getSnapshot, model.getInitialSnapshot);
  useEffect(() => {
    void model.retry();
    return model.cancel;
  }, [model]);
  return { state, retry: model.retry };
}
