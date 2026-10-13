type SearchableProduct = {
  name: string;
  category_name: string;
  sku: string;
  category_id: string;
};

function normalizeSearchText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/gu, ' ');
}

/** Filters loaded API products locally, without changing their data or order. */
export function filterCatalogProducts<T extends SearchableProduct>(
  products: readonly T[],
  query: string,
  categoryId: string,
): T[] {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);

  return products.filter((product) => {
    if (categoryId !== 'all' && product.category_id !== categoryId) return false;
    if (terms.length === 0) return true;

    const fields = [product.name, product.category_name, product.sku].map(normalizeSearchText);
    return terms.every((term) => fields.some((field) => field.includes(term)));
  });
}
