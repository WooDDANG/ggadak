import { Controller, Route, Tags, Get, Post, Body, Query, SuccessResponse } from 'tsoa';
import { Service } from 'typedi';
import { Request, Response, NextFunction } from 'express';
import { FeedbackService } from '../../services/feedback.service.js';
import {
  CreateFeedbackDtoSchema,
  QueryFeedbacksDtoSchema,
  CreateFeedbackDto,
  FeedbackListResponseDto,
} from '../../dto/feedback.dto.js';
import { BadRequestError } from '../../errors/AppError.js';

@Tags('Feedbacks')
@Route('api/feedbacks')
@Service()
export class FeedbackController extends Controller {
  constructor(private service: FeedbackService) {
    super();
  }

  @Get('')
  public async listFeedbacks(
    @Query() channelId?: string,
    @Query() limit?: number,
  ): Promise<FeedbackListResponseDto> {
    const feedbacks = this.service.getFeedbacks(channelId, limit || 10);
    return { feedbacks };
  }

  @Post('')
  @SuccessResponse(201, 'Created')
  public async createFeedback(
    @Body() body: CreateFeedbackDto,
  ): Promise<{ status: string; id: string }> {
    this.service.saveFeedback(body);
    return { status: 'ok', id: body.id };
  }

  getFeedbacks = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = QueryFeedbacksDtoSchema.safeParse(req.query);
      if (!parsed.success) {
        throw new BadRequestError('Invalid query parameters', parsed.error.issues);
      }
      const feedbacks = this.service.getFeedbacks(parsed.data.channelId, parsed.data.limit);
      res.status(200).json({ feedbacks });
    } catch (err) {
      next(err);
    }
  };

  saveFeedback = (req: Request, res: Response, next: NextFunction): void => {
    try {
      const parsed = CreateFeedbackDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid ExternalFeedback payload', parsed.error.issues);
      }

      this.service.saveFeedback(parsed.data);
      res.status(201).json({ status: 'ok', id: parsed.data.id });
    } catch (err) {
      next(err);
    }
  };
}
