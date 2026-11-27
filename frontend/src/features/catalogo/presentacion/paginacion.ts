/** Visual pages over the loaded catalog; HTTP cursor pagination stays in the Repository. */
export const CATALOG_PAGE_SIZE = 10;

export function paginateCatalogProducts<T>(products: readonly T[], requestedPage: number) {
  const totalItems = products.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / CATALOG_PAGE_SIZE));
  const page = Number.isFinite(requestedPage)
    ? Math.min(totalPages, Math.max(1, Math.trunc(requestedPage))) : 1;
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  const items = products.slice(offset, offset + CATALOG_PAGE_SIZE);

  return {
    items, page, totalPages, totalItems,
    firstItem: totalItems === 0 ? 0 : offset + 1,
    lastItem: offset + items.length,
    hasPrevious: page > 1,
    hasNext: page < totalPages,
  };
}
