import type { CatalogProduct } from '../catalogo/dominio/modelos';
import { resolveCart } from './carrito';

export type OrderStatus = 'processing' | 'shipping' | 'delivered';
export const orderLabels: Record<OrderStatus, string> = { processing: 'Procesando', shipping: 'En camino', delivered: 'Entregado' };
export const orderProgress: Record<OrderStatus, number> = { processing: 1, shipping: 2, delivered: 3 };
export const trackingSteps = ['Pedido confirmado', 'En preparación', 'En camino', 'Entregado'] as const;
export function buildDemoOrders(products: readonly CatalogProduct[]) {
  if (!products.length) return [];
  return (['processing', 'shipping', 'delivered'] as const).map((status, index) => {
    const selected = products.slice(index * 3, index * 3 + 3);
    const lines = selected.length ? selected : products.slice(0, 1);
    return { id: 'ejemplo-' + status, status,
      ...resolveCart(lines.map(product => ({ id: product.id, quantity: 1 })), products) };
  });
}
