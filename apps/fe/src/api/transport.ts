export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}
import { getAccessToken, setAccessToken, recoverAccessToken, getSessionEpoch } from './session';
export async function authorizedFetch(url: string, options: RequestInit = {}) {
  const requestEpoch = getSessionEpoch();
  const assertCurrentSession = () => {
    if (requestEpoch !== getSessionEpoch())
      throw new ApiHttpError('로그인 사용자가 바뀌었습니다. 다시 시도하세요.', 409);
  };
  const headers = new Headers(options.headers);
  if (getAccessToken()) headers.set('Authorization', `Bearer ${getAccessToken()}`);
  const origin = (import.meta as any).env?.VITE_API_ORIGIN ?? '';
  let response = await fetch(`${origin}${url}`, { ...options, credentials: 'include', headers });
  assertCurrentSession();
  const authRequest = /^\/api\/v1\/auth\/(authorize|login|session|logout)$/.test(url.split('?')[0]);
  if (response.status === 401 && !authRequest) {
    const pending = recoverAccessToken();
    if (pending) {
      await pending;
      assertCurrentSession();
      if (getAccessToken()) {
        headers.set('Authorization', `Bearer ${getAccessToken()}`);
        response = await fetch(`${origin}${url}`, { ...options, credentials: 'include', headers });
      }
    }
  }
  assertCurrentSession();
  if (response.status === 401 && !authRequest) {
    setAccessToken('');
    window.dispatchEvent(new Event('ggaddak:logout'));
  }
  return response;
}
export async function authenticatedClient<T>(url: string, options: RequestInit = {}): Promise<T> {
  const requestEpoch = getSessionEpoch();
  const response = await authorizedFetch(url, options);
  const data = response.status === 204 ? null : await response.json();
  if (response.ok && requestEpoch !== getSessionEpoch())
    throw new ApiHttpError('로그인 사용자가 바뀌었습니다. 다시 시도하세요.', 409);
  if (!response.ok)
    throw new ApiHttpError(
      data?.message ?? data?.error ?? `HTTP ${response.status}`,
      response.status,
    );
  return { data, status: response.status, headers: response.headers } as T;
}
