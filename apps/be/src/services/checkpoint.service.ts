import { DecisionRepository } from '../db.js';

export class CheckpointService {
  constructor(private repo: DecisionRepository) {}

  getCheckpoint(channelId: string): string | null {
    return this.repo.getCheckpoint(channelId);
  }

  saveCheckpoint(channelId: string, lastMessageId: string): void {
    this.repo.saveCheckpoint(channelId, lastMessageId);
  }
}
