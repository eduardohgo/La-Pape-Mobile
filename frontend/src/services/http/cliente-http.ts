import type { ApiConfig } from '../../config/configuracion-api';
import { ApiError } from './errores-http';

export type RequestOptions = { signal?: AbortSignal; query?: Readonly<Record<string, string>>; bearer?: string;
  authFormat?: 'jwt-v1' };
export type FetchFunction = (
  url: string,
  options: {
    method: 'GET' | 'POST' | 'PATCH';
    headers: Record<string, string>;
    signal: AbortSignal;
    body?: string;
    credentials?: 'omit';
    redirect?: 'error';
  },
) => Promise<Pick<Response, 'ok' | 'status' | 'headers' | 'json'>>;

type Validator<T> = (data: unknown) => data is T;

export function createHttpClient(config: ApiConfig, fetchRequest: FetchFunction = fetch) {
  function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, options: RequestOptions, validate: Validator<T>, body?: object): Promise<T>;
  function request(method: 'POST', path: string, options: RequestOptions, validate?: undefined, body?: object): Promise<void>;
  async function request<T>(method: 'GET' | 'POST' | 'PATCH', path: string, options: RequestOptions, validate?: Validator<T>, body?: object) {
    if (!/^\/[a-zA-Z0-9/_-]+$/.test(path) || path.startsWith('//')) throw new ApiError('configuration');
    if (options.signal?.aborted) throw new ApiError('cancelled');
    if (options.query && Object.keys(options.query).some((key) => !/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key))) {
      throw new ApiError('configuration');
    }
    if (options.bearer !== undefined && (options.bearer.length > 2400
      || !/^(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.test(options.bearer))) {
      throw new ApiError('configuration');
    }
    if (options.authFormat && (path !== '/auth/login' || method !== 'POST' || options.bearer)) {
      throw new ApiError('configuration');
    }

    const sensitive = method !== 'GET' || options.bearer !== undefined;
    if (sensitive && !config.baseUrl.startsWith('https://')) throw new ApiError('configuration');
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (options.bearer) headers.Authorization = 'Bearer ' + options.bearer;
    if (options.authFormat) headers['X-Auth-Format'] = options.authFormat;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const search = options.query ? new URLSearchParams(Object.entries(options.query)).toString() : '';
    const requestUrl = config.baseUrl + path + (search ? '?' + search : '');

    const controller = new AbortController();
    let rejectAbort: (error: ApiError) => void = () => {};
    const interrupted = new Promise<never>((_resolve, reject) => { rejectAbort = reject; });
    let abortError: ApiError | undefined;
    const abort = (kind: 'cancelled' | 'timeout') => {
      if (abortError) return;
      abortError = new ApiError(kind);
      controller.abort();
      rejectAbort(abortError);
    };
    const onCancel = () => abort('cancelled');
    options.signal?.addEventListener('abort', onCancel, { once: true });
    const timer = setTimeout(() => abort('timeout'), config.timeoutMs);
    try {
      const work = async () => {
        const response = await fetchRequest(requestUrl, {
          method, headers, signal: controller.signal,
          ...(sensitive && { credentials: 'omit', redirect: 'error' }),
          ...(body !== undefined && { body: JSON.stringify(body) }),
        });
        if (!response.ok) {
          const retryAfter = response.status === 429 ? response.headers.get('retry-after') : null;
          const seconds = retryAfter && /^\d{1,8}$/.test(retryAfter) ? Number(retryAfter) : undefined;
          throw new ApiError('http', response.status, seconds);
        }
        if (!validate) {
          if (response.status !== 204) throw new ApiError('invalid-response');
          return;
        }
        if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
          throw new ApiError('invalid-response');
        }
        let data: unknown;
        try { data = await response.json(); } catch { throw new ApiError('invalid-response'); }
        if (!validate(data)) throw new ApiError('invalid-response');
        return data;
      };
      return await Promise.race([work(), interrupted]);
    } catch (error) {
      if (abortError) throw abortError;
      if (error instanceof ApiError) throw error;
      throw new ApiError('network');
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onCancel);
    }
  }

  return {
    get: <T>(path: string, validate: Validator<T>, options: RequestOptions = {}) =>
      request('GET', path, options, validate),
    post: <T>(path: string, body: object, validate: Validator<T>, options: RequestOptions = {}) =>
      request('POST', path, options, validate, body),
    patch: <T>(path: string, body: object, validate: Validator<T>, options: RequestOptions = {}) =>
      request('PATCH', path, options, validate, body),
    postNoContent: (path: string, options: RequestOptions = {}, body?: object) => request('POST', path, options, undefined, body),
  };
}
