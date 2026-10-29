export type CatalogCategory = Readonly<{
  id: string;
  name: string;
  description: string | null;
}>;

export type CatalogProduct = Readonly<{
  id: string;
  sku: string;
  name: string;
  category_id: string;
  category_name: string;
  brand_id: string;
  brand_name: string;
  price: string;
  currency: 'MXN';
  image_url: string | null;
}>;

export type CatalogPage = Readonly<{
  data: CatalogProduct[];
  page: { hasMore: boolean; nextCursor: string | null };
}>;

export type DemoCatalogProduct = Readonly<{
  id: string;
  sku: string;
  name: string;
  category_id: string;
  category_name: string;
  price: string;
  currency: 'MXN';
  image_url: null;
  is_demo: true;
  is_for_sale: false;
}>;

export type CatalogProductDetail = CatalogProduct & Readonly<{ description: string }>;


export type VisibleProduct = CatalogProduct | DemoCatalogProduct;
export type VisibleProductDetail = CatalogProductDetail | DemoCatalogProduct;
export type CatalogData = Readonly<{
  products: readonly VisibleProduct[];
  categories: readonly CatalogCategory[];
}>;

export class ProductNotFoundError extends Error {
  constructor() { super('Producto no encontrado'); this.name = 'ProductNotFoundError'; }
}
