import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';

@Service()
export class CheckpointService {
  constructor(private repo: DecisionRepository) {}

  async getCheckpoint(channelId: string): Promise<string | null> {
    return this.repo.getCheckpoint(channelId);
  }

  async saveCheckpoint(channelId: string, lastMessageId: string): Promise<void> {
    await this.repo.saveCheckpoint(channelId, lastMessageId);
  }
}
