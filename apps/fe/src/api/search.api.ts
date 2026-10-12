import { searchDecisions } from './generated';
export const searchApi = {
  async search(guildId: string, query: string, limit = 10) {
    const response = await searchDecisions({ guildId, query, limit });
    if (response.status !== 200 || !response.data.success)
      throw new Error(response.data.message || `HTTP ${response.status}`);
    return response.data.data;
  },
};
