import { getApiConfig, type ApiConfig } from '../config/env';
import { ApiError } from './http/errors';
import { createHttpClient, type FetchFunction, type RequestOptions } from './http/client';

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

export function createCatalogService(config: ApiConfig, request: FetchFunction = fetch) {
  const client = createHttpClient(config, request);
  return {
    async categories(options: RequestOptions = {}): Promise<CatalogCategory[]> {
      const response = await client.get('/categories', isCategoryResponse, options);
      return response.data;
    },
    async products(options: RequestOptions = {}): Promise<CatalogProduct[]> {
      const result: CatalogProduct[] = [];
      const cursors = new Set<string>();
      let after: string | null = null;
      for (let pageNumber = 0; pageNumber < MAX_PAGES; pageNumber++) {
        const query = { limit: String(PAGE_LIMIT), ...(after ? { after } : {}) };
        const response = await client.get('/products', isProductResponse, { ...options, query });
        result.push(...response.data);
        if (!response.page.hasMore) return result;
        const cursor = response.page.nextCursor;
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
