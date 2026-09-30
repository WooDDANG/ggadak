import { Controller, Route, Tags, Get, Post, Body, Query, SuccessResponse } from 'tsoa';
import { Service } from 'typedi';
import { FeedbackService } from '../../services/feedback.service.js';
import {
  CreateFeedbackDto,
  FeedbackListResponseDto,
} from '../../dto/feedback.dto.js';

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
}
