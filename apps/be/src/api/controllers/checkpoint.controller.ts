import { Controller, Route, Tags, Get, Post, Body, Path, Security } from 'tsoa';
import { Service } from 'typedi';
import { CheckpointService } from '../../services/checkpoint.service.js';
import { SaveCheckpointDto, CheckpointResponseDto } from '../../dto/checkpoint.dto.js';

@Security('service')
@Tags('Checkpoints')
@Route('api/channels')
@Service()
export class CheckpointController extends Controller {
  constructor(private service: CheckpointService) {
    super();
  }

  @Get('{channelId}/checkpoint')
  public async getByChannelId(@Path() channelId: string): Promise<CheckpointResponseDto> {
    const lastMessageId = await this.service.getCheckpoint(channelId);
    return { channelId, lastMessageId };
  }

  @Post('{channelId}/checkpoint')
  public async save(
    @Path() channelId: string,
    @Body() body: SaveCheckpointDto,
  ): Promise<{ status: string; channelId: string; lastMessageId: string }> {
    await this.service.saveCheckpoint(channelId, body.lastMessageId);
    return {
      status: 'ok',
      channelId,
      lastMessageId: (await this.service.getCheckpoint(channelId))!,
    };
  }
}
