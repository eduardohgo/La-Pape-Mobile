import type { LocalStorage } from './almacenamiento';

export type LocalState<T> = Readonly<{ status: 'loading' | 'ready' | 'error'; value: T; saving: boolean; error?: string }>;

export function createLocalController<T>(storage: LocalStorage, empty: T, parse: (value: unknown) => T) {
  empty = parse(empty);
  let state: LocalState<T> = { status: 'loading', value: empty, saving: false };
  let queue = Promise.resolve();
  const subscribers = new Set<() => void>();
  const publish = (next: LocalState<T>) => { state = Object.freeze(next); subscribers.forEach(fn => fn()); };
  function enqueue(work: () => Promise<boolean>) {
    const pending = queue.then(work);
    queue = pending.then(() => undefined, () => undefined);
    return pending;
  }
  return Object.freeze({
    getSnapshot: () => state,
    subscribe(listener: () => void) { subscribers.add(listener); return () => { subscribers.delete(listener); }; },
    restore: () => enqueue(async () => {
      publish({ ...state, status: 'loading', error: undefined });
      try {
        const value = await storage.read();
        publish({ status: 'ready', value: value === null ? empty : parse(value), saving: false });
        return true;
      } catch {
        publish({ ...state, status: 'error', saving: false, error: 'No pudimos recuperar los datos de este dispositivo.' });
        return false;
      }
    }),
    update: (change: (value: T) => T) => enqueue(async () => {
      if (state.status !== 'ready') return false;
      publish({ ...state, saving: true, error: undefined });
      try {
        const value = parse(change(state.value));
        await storage.write(value);
        publish({ status: 'ready', value, saving: false });
        return true;
      } catch {
        publish({ ...state, saving: false, error: 'No pudimos guardar el cambio. Inténtalo de nuevo.' });
        return false;
      }
    }),
    reset: () => enqueue(async () => {
      try {
        await storage.write(empty);
        publish({ status: 'ready', value: empty, saving: false });
        return true;
      } catch {
        publish({ ...state, error: 'No pudimos borrar los datos locales. Inténtalo de nuevo.' });
        return false;
      }
    }),
  });
}
