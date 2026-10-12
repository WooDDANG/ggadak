/** Shared v1 response contract. Domain payloads remain typed by each endpoint. */
export interface ApiResponse<T> {
  success: boolean;
  code: string;
  message: string;
  data: T;
}

export function apiSuccess<T>(data: T): ApiResponse<T> {
  return { success: true, code: 'OK', message: 'Success', data };
}

export function apiFailure(
  code: string,
  message: string,
  data: unknown = null,
): ApiResponse<unknown> {
  return { success: false, code, message, data };
}

export function isV1Request(path: string): boolean {
  return path === '/api/v1' || path.startsWith('/api/v1/');
}
