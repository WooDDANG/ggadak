import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';

@Service()
export class CheckpointService {
  constructor(private repo: DecisionRepository) {}

  getCheckpoint(channelId: string): string | null {
    return this.repo.getCheckpoint(channelId);
  }

  saveCheckpoint(channelId: string, lastMessageId: string): void {
    this.repo.saveCheckpoint(channelId, lastMessageId);
  }
}
