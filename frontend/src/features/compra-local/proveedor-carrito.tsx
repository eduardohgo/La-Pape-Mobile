import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { addCartEntry, parseCart, setCartQuantity, type CartEntry } from './carrito';
import { createLocalController } from './controlador-local';
import { deviceStorage } from './persistencia-nativa';

const buildCart = () => createLocalController<readonly CartEntry[]>(deviceStorage('lapape.local.cart.v1'), [], parseCart);
type Controller = ReturnType<typeof buildCart>;
const Context = createContext<Controller | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(buildCart);
  useEffect(() => { void controller.restore(); }, [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useCart() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Falta CartProvider.');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return {
    ...state,
    add: (id: string, quantity = 1) => controller.update(entries => addCartEntry(entries, id, quantity)),
    quantity: (id: string, value: number) => controller.update(entries => setCartQuantity(entries, id, value)),
    remove: (id: string) => controller.update(entries => entries.filter(entry => entry.id !== id)),
    retry: controller.restore,
    clear: controller.reset,
  };
}
