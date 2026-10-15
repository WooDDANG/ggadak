import { graph } from './generated';
import { unwrapApiResponse } from './api-response';
import { ApiHttpError } from './transport';

export const analysisGraphApi = {
  get: async (requestId: string, guildId: string, signal?: AbortSignal) => {
    const response = await graph(requestId, { guildId }, { signal });
    if (response.status !== 200) {
      throw new ApiHttpError(
        response.data.message || '그래프를 불러오지 못했습니다.',
        response.status,
      );
    }
    return unwrapApiResponse(response);
  },
};

export function graphErrorMessage(error: unknown): string {
  if (error instanceof ApiHttpError) {
    const messages: Record<number, string> = {
      401: '로그인이 필요합니다.',
      403: '이 서버의 분석에 접근할 권한이 없습니다.',
      404: '분석 요청이 없거나 그래프가 없는 이전 분석입니다.',
      409: '분석이 아직 완료되지 않았습니다. 잠시 후 다시 조회하세요.',
      422: '최종 분석 실패로 공개할 그래프가 없습니다. 새 수동 분석이 필요합니다.',
      503: '분석 서비스를 일시적으로 사용할 수 없습니다.',
    };
    return messages[error.status] || '그래프 조회에 실패했습니다. 다시 시도하세요.';
  }
  return '그래프에 연결하지 못했습니다. 네트워크 상태를 확인하고 다시 시도하세요.';
}
