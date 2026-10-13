import { getApiConfig, type ApiConfig } from '../config/configuracion-api';
import { ApiError } from './http/errores-http';
import { createHttpClient, type FetchFunction, type RequestOptions } from './http/cliente-http';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DECIMAL = /^(?:0|[1-9][0-9]{0,7})\.[0-9]{2}$/;
const PAGE_LIMIT = 50;
const MAX_PAGES = 100;

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

export type CatalogProductDetailResponse = Readonly<{ data: CatalogProductDetail }>;

export type DemoProductDetailResponse = Readonly<{
  mode: 'demo';
  purchasable: false;
  data: DemoCatalogProduct;
}>;

export type DemoCatalogResponse = Readonly<{
  mode: 'demo';
  purchasable: false;
  data: DemoCatalogProduct[];
}>;

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isCategoryResponse(value: unknown): value is { data: CatalogCategory[] } {
  return record(value) && Array.isArray(value.data) && value.data.every((item: unknown) =>
    record(item) &&
    typeof item.id === 'string' && UUID.test(item.id) &&
    nonempty(item.name) &&
    (item.description === null || typeof item.description === 'string'));
}

export function isProductResponse(value: unknown): value is CatalogPage {
  if (!record(value) || !Array.isArray(value.data) || !record(value.page)) return false;
  const { hasMore, nextCursor } = value.page;
  if (typeof hasMore !== 'boolean' ||
      (hasMore ? typeof nextCursor !== 'string' || !UUID.test(nextCursor)
        : nextCursor !== null)) return false;
  return value.data.every((item: unknown) => {
    if (!record(item)) return false;
    return typeof item.id === 'string' && UUID.test(item.id) &&
      typeof item.category_id === 'string' && UUID.test(item.category_id) &&
      typeof item.brand_id === 'string' && UUID.test(item.brand_id) &&
      nonempty(item.sku) && nonempty(item.name) &&
      nonempty(item.category_name) && nonempty(item.brand_name) &&
      typeof item.price === 'string' && DECIMAL.test(item.price) &&
      item.currency === 'MXN' &&
      (item.image_url === null ||
        (typeof item.image_url === 'string' && /^https:\/\//.test(item.image_url)));
  });
}

export function isDemoCatalogResponse(value: unknown): value is DemoCatalogResponse {
  if (!record(value) || value.mode !== 'demo' || value.purchasable !== false ||
      !Array.isArray(value.data) || value.data.length > 20) return false;
  return value.data.every((item: unknown) =>
    record(item) &&
    typeof item.id === 'string' && UUID.test(item.id) &&
    typeof item.category_id === 'string' && UUID.test(item.category_id) &&
    nonempty(item.sku) && nonempty(item.name) && nonempty(item.category_name) &&
    typeof item.price === 'string' && DECIMAL.test(item.price) &&
    item.currency === 'MXN' && item.image_url === null &&
    item.is_demo === true && item.is_for_sale === false);
}

export function isCatalogProductDetailResponse(value: unknown): value is CatalogProductDetailResponse {
  return record(value) && record(value.data) &&
    typeof value.data.description === 'string' &&
    isProductResponse({ data: [value.data], page: { hasMore: false, nextCursor: null } });
}

export function isDemoProductDetailResponse(value: unknown): value is DemoProductDetailResponse {
  return record(value) && record(value.data) &&
    isDemoCatalogResponse({ mode: value.mode, purchasable: value.purchasable, data: [value.data] });
}

export function createCatalogService(config: ApiConfig, request: FetchFunction = fetch) {
  const client = createHttpClient(config, request);
  return {
    async demoProducts(options: RequestOptions = {}): Promise<DemoCatalogProduct[]> {
      const response: DemoCatalogResponse = await client.get<DemoCatalogResponse>(
        '/demo/products',
        isDemoCatalogResponse,
        options,
      );
      return response.data;
    },
    async demoProduct(id: string, options: RequestOptions = {}): Promise<DemoCatalogProduct> {
      if (!UUID.test(id)) throw new ApiError('configuration');
      const response: DemoProductDetailResponse = await client.get<DemoProductDetailResponse>(
        `/demo/products/${id}`,
        isDemoProductDetailResponse,
        options,
      );
      return response.data;
    },
    async product(id: string, options: RequestOptions = {}): Promise<CatalogProductDetail> {
      if (!UUID.test(id)) throw new ApiError('configuration');
      const response: CatalogProductDetailResponse = await client.get<CatalogProductDetailResponse>(
        `/products/${id}`,
        isCatalogProductDetailResponse,
        options,
      );
      return response.data;
    },
    async categories(options: RequestOptions = {}): Promise<CatalogCategory[]> {
      const response = await client.get('/categories', isCategoryResponse, options);
      return response.data;
    },
    async products(options: RequestOptions = {}): Promise<CatalogProduct[]> {
      const result: CatalogProduct[] = [];
      const cursors = new Set<string>();
      let after: string | null = null;
      for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
        const query: Record<string, string> = { limit: String(PAGE_LIMIT) };
        if (after !== null) query.after = after;
        const response: CatalogPage = await client.get<CatalogPage>(
          '/products',
          isProductResponse,
          { ...options, query },
        );
        result.push(...response.data);
        if (!response.page.hasMore) return result;
        const cursor: string | null = response.page.nextCursor;
        if (!cursor || cursors.has(cursor) || response.data.length === 0) {
          throw new ApiError('invalid-response');
        }
        cursors.add(cursor);
        after = cursor;
      }
      throw new ApiError('invalid-response');
    },
  };
}

export function getCatalogService() {
  return createCatalogService(getApiConfig());
}
