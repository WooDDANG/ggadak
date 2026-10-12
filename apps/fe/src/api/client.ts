import { authorizedFetch } from './transport';
export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const response = await authorizedFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    throw new Error(errorBody.error || `HTTP ${response.status}: ${response.statusText}`);
  }

  return response.json();
}
