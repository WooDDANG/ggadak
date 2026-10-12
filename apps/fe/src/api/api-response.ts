interface ApiResponseEnvelope<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface HttpApiResponse<T> {
  status: number;
  data: ApiResponseEnvelope<T>;
}

export function unwrapApiResponse<T>({ status, data }: HttpApiResponse<T>): T {
  if (status !== 200 || !data.success) {
    throw new Error(data.message || `HTTP ${status}`);
  }
  return data.data;
}
