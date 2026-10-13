import { listAnalysisDeliveries, retryAnalysisRequest } from './generated';
import { unwrapApiResponse } from './api-response';

export const recoveryApi = {
  list: async (guildId: string) => unwrapApiResponse(await listAnalysisDeliveries({ guildId })),
  retry: async (guildId: string, requestId: string, commandId: string) => {
    const response = await retryAnalysisRequest(requestId, { commandId }, { guildId });
    if (response.status !== 202 || !response.data.success)
      throw new Error(response.data.message || '재시도 요청을 전달하지 못했습니다.');
    return response.data.data;
  },
};
