export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
import { getAccessToken, setAccessToken } from './session';
export async function authorizedFetch(url: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (getAccessToken()) headers.set('Authorization', `Bearer ${getAccessToken()}`);
  const origin = (import.meta as any).env?.VITE_API_ORIGIN ?? '';
  const response = await fetch(`${origin}${url}`, { ...options, credentials: 'include', headers });
  if (response.status === 401) {
    setAccessToken('');
    window.dispatchEvent(new Event('ggaddak:logout'));
  }
  return response;
}
export async function authenticatedClient<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(url, options);
  const data = response.status === 204 ? null : await response.json();
  if (!response.ok)
    throw new ApiHttpError(
      data?.message ?? data?.error ?? `HTTP ${response.status}`,
      response.status,
    );
  return { data, status: response.status, headers: response.headers } as T;
}
