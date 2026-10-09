import type { ApiConfig } from '../../config/env';
import { ApiError } from './errors';

export type RequestOptions = { signal?: AbortSignal };
export type FetchFunction = typeof fetch;

// Only GET JSON is exposed in this stage. Auth and mutations belong to later PBs.
export function createHttpClient(config: ApiConfig, fetchRequest: FetchFunction = fetch) {
  return {
    async get<T>(path: string, validate: (data: unknown) => data is T, options: RequestOptions = {}): Promise<T> {
      if (!/^\/[a-zA-Z0-9/_-]+$/.test(path) || path.startsWith('//')) throw new ApiError('configuration');
      if (options.signal?.aborted) throw new ApiError('cancelled');
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
          const response = await fetchRequest(`${config.baseUrl}${path}`, {
            method: 'GET',
            headers: { Accept: 'application/json' },
            signal: controller.signal,
          });
          if (!response.ok) throw new ApiError('http', response.status);
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
    },
  };
}
