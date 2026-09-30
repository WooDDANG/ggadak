import { Controller, Route, Tags, Get, Post, Body, Path } from 'tsoa';
import { Service } from 'typedi';
import { Request, Response, NextFunction } from 'express';
import { CheckpointService } from '../../services/checkpoint.service.js';
import {
  SaveCheckpointDtoSchema,
  SaveCheckpointDto,
  CheckpointResponseDto,
} from '../../dto/checkpoint.dto.js';
import { BadRequestError } from '../../errors/AppError.js';

@Tags('Checkpoints')
@Route('api/checkpoints')
@Service()
export class CheckpointController extends Controller {
  constructor(private service: CheckpointService) {
    super();
  }

  @Get('{channelId}')
  public async getByChannelId(
    @Path() channelId: string,
  ): Promise<CheckpointResponseDto> {
    const lastMessageId = this.service.getCheckpoint(channelId);
    return { channelId, lastMessageId };
  }

  @Post('{channelId}')
  public async save(
    @Path() channelId: string,
    @Body() body: SaveCheckpointDto,
  ): Promise<{ status: string; channelId: string; lastMessageId: string }> {
    this.service.saveCheckpoint(channelId, body.lastMessageId);
    return { status: 'ok', channelId, lastMessageId: body.lastMessageId };
  }

  getCheckpoint = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const channelId = Array.isArray(req.params.channelId)
        ? req.params.channelId[0]
        : req.params.channelId;
      const lastMessageId = this.service.getCheckpoint(channelId);
      res.status(200).json({ channelId, lastMessageId });
    } catch (err) {
      next(err);
    }
  };

  saveCheckpoint = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const channelId = Array.isArray(req.params.channelId)
        ? req.params.channelId[0]
        : req.params.channelId;
      const parsed = SaveCheckpointDtoSchema.safeParse(req.body);

      if (!parsed.success) {
        throw new BadRequestError('Invalid checkpoint payload', parsed.error.issues);
      }

      this.service.saveCheckpoint(channelId, parsed.data.lastMessageId);
      res.status(200).json({ status: 'ok', channelId, lastMessageId: parsed.data.lastMessageId });
    } catch (err) {
      next(err);
    }
  };
}
