import type { CatalogProduct } from '../catalogo/dominio/modelos';

export type CartEntry = Readonly<{ id: string; quantity: number }>;
export type CartLine = Readonly<{ product: CatalogProduct; quantity: number; cents: number }>;
export const isUuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(value);

export function parseCart(value: unknown): readonly CartEntry[] {
  if (!Array.isArray(value)) throw new Error('Carrito inválido.');
  const ids = new Set<string>();
  return Object.freeze(value.map(entry => {
    if (!entry || !isUuid(entry.id) || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1 || ids.has(entry.id)) {
      throw new Error('Artículo de carrito inválido.');
    }
    ids.add(entry.id);
    return Object.freeze({ id: entry.id, quantity: entry.quantity });
  }));
}

export function addCartEntry(entries: readonly CartEntry[], id: string, quantity = 1): readonly CartEntry[] {
  if (!isUuid(id) || !Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Producto o cantidad inválidos.');
  const found = entries.find(entry => entry.id === id);
  return parseCart(found ? entries.map(entry => entry.id === id ? { ...entry, quantity: entry.quantity + quantity } : entry)
    : [...entries, { id, quantity }]);
}

export function setCartQuantity(entries: readonly CartEntry[], id: string, quantity: number): readonly CartEntry[] {
  return parseCart(entries.map(entry => entry.id === id ? { ...entry, quantity } : entry));
}

export function priceCents(price: string): number {
  if (!/^(0|[1-9][0-9]{0,7})\.[0-9]{2}$/.test(price)) throw new Error('Precio inválido.');
  return Number(price.replace('.', ''));
}
export function formatMoney(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error('Importe inválido.');
  return '$' + Math.floor(cents / 100).toLocaleString('es-MX') + '.' + String(cents % 100).padStart(2, '0');
}

export function resolveCart(entries: readonly CartEntry[], products: readonly CatalogProduct[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  const missing: string[] = [];
  const lines: CartLine[] = [];
  let subtotal = 0;
  for (const entry of parseCart(entries)) {
    const product = byId.get(entry.id);
    if (!product) { missing.push(entry.id); continue; }
    const cents = priceCents(product.price) * entry.quantity;
    subtotal += cents;
    if (!Number.isSafeInteger(subtotal)) throw new Error('La cantidad supera el límite de cálculo.');
    lines.push({ product, quantity: entry.quantity, cents });
  }
  return { lines, missing, subtotal };
}
