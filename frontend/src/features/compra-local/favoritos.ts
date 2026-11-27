import { isUuid } from './carrito';
export function parseFavorites(value: unknown): readonly string[] {
  if (!Array.isArray(value) || value.some(id => !isUuid(id)) || new Set(value).size !== value.length) throw new Error('Favoritos inválidos.');
  return Object.freeze([...value]);
}
export function toggleFavorite(value: readonly string[], id: string): readonly string[] {
  if (!isUuid(id)) throw new Error('Producto inválido.');
  return parseFavorites(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
}
