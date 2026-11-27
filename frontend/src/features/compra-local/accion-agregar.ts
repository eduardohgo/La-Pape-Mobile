import { isUuid, type CartEntry } from './carrito';

export const cartItemCount = (entries: readonly CartEntry[]) => entries.reduce((total, item) => total + item.quantity, 0);

// Lock synchronously before the first await; UI disabled state alone cannot stop rapid taps.
export type CartAddResult = 'added' | 'ignored' | 'error';
export function createCartAddAction(add: (id: string, quantity: number) => Promise<boolean>, now = Date.now) {
  const pending = new Set<string>();
  const completed = new Map<string, number>();
  return async (id: string, quantity = 1): Promise<CartAddResult> => {
    if (!isUuid(id) || !Number.isSafeInteger(quantity) || quantity < 1) return 'error';
    if (pending.has(id) || now() - (completed.get(id) ?? -Infinity) < 650) return 'ignored';
    pending.add(id);
    try {
      if (!await add(id, quantity)) return 'error';
      completed.set(id, now());
      return 'added';
    } catch { return 'error'; }
    finally { pending.delete(id); }
  };
}
