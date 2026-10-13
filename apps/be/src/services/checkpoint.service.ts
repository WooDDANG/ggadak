import { SaveCheckpointDtoSchema } from '../dto/checkpoint.dto.js';
import { BadRequestError } from '../errors/AppError.js';
import { Service } from 'typedi';
import { DecisionRepository } from '../repositories/decision.repository.js';

@Service()
export class CheckpointService {
  constructor(private repo: DecisionRepository) {}

  async getCheckpoint(channelId: string): Promise<string | null> {
    return this.repo.getCheckpoint(channelId);
  }

  async saveCheckpoint(channelId: string, lastMessageId: string): Promise<void> {
    const parsed = SaveCheckpointDtoSchema.safeParse({ lastMessageId });
    if (!parsed.success) throw new BadRequestError('Invalid channel checkpoint');
    await this.repo.saveCheckpoint(channelId, parsed.data.lastMessageId);
  }
}
