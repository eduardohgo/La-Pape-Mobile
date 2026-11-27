
import { loadCatalog, loadProduct } from '../dominio/casos-uso';
import { ProductNotFoundError } from '../dominio/modelos';
import type { CatalogRepository } from '../dominio/repositorio-catalogo';

type RequestState<T, E extends string> = Readonly<
  { status: 'loading' } | { status: E } | ({ status: 'loaded' } & T)
>;

// OBSERVER: Aquí creo el ViewModel que notifica los cambios de estado a las pantallas.
function createRequestViewModel<T extends object, E extends string>(
  load: (signal: AbortSignal) => Promise<T>, failure: (error: unknown) => E,
) {
  const initial: RequestState<T, E> = Object.freeze({ status: 'loading' });
  let snapshot: RequestState<T, E> = initial;
  let active: AbortController | undefined;
  const listeners = new Map<() => void, number>();

  // OBSERVER: Cuando cambia el estado, aviso a todos los observadores suscritos.
  function publish(next: RequestState<T, E>) {
    snapshot = Object.freeze(next);
    for (const listener of [...listeners.keys()]) {
      if (listeners.has(listener)) listener();
    }
  }

  function cancel() {
    active?.abort();
    active = undefined;
  }

  return Object.freeze({
    getSnapshot: () => snapshot,
    getInitialSnapshot: () => initial,

    // OBSERVER: Aquí registro los observadores y permito cancelar su suscripción.
    subscribe(listener: () => void) {
      listeners.set(listener, (listeners.get(listener) ?? 0) + 1);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        const count = listeners.get(listener) ?? 0;
        if (count <= 1) listeners.delete(listener);
        else listeners.set(listener, count - 1);
      };
    },

    async retry() {
      cancel();
      const request = new AbortController();
      active = request;
      publish(initial);
      try {
        const data = await load(request.signal);
        if (active === request && !request.signal.aborted) publish({ status: 'loaded', ...data });
      } catch (error) {
        if (active === request && !request.signal.aborted) publish({ status: failure(error) });
      } finally {
        // Cancelo cualquier petición HTTP que siga pendiente.
        request.abort();
        if (active === request) active = undefined;
      }
    },
    cancel,
  });
}

// FUNCIÓN FÁBRICA: Aquí creo el ViewModel del catálogo utilizando mi repositorio.
export function createCatalogViewModel(repository: () => CatalogRepository) {
  return createRequestViewModel(signal => loadCatalog(repository(), signal), () => 'error' as const);
}

export function createProductDetailViewModel(id: string, repository: () => CatalogRepository) {
  return createRequestViewModel(
    signal => loadProduct(repository(), id, signal),
    error => error instanceof ProductNotFoundError ? 'not-found' as const : 'error' as const,
  );
}
