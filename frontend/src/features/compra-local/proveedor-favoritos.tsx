import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { createLocalController } from './controlador-local';
import { deviceStorage } from './persistencia-nativa';
import { parseFavorites, toggleFavorite } from './favoritos';

const build = () => createLocalController<readonly string[]>(deviceStorage('lapape.local.favorites.v1'), [], parseFavorites);
const Context = createContext<ReturnType<typeof build> | null>(null);
export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(build);
  useEffect(() => { void controller.restore(); }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useFavorites() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Falta FavoritesProvider.');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...state, toggle: (id: string) => controller.update(value => toggleFavorite(value, id)), retry: controller.restore, clear: controller.reset };
}
