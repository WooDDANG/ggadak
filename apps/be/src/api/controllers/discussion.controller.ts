import { Controller, Route, Tags, Post, Body, Header } from 'tsoa';
import { Service } from 'typedi';
import { DiscussionService } from '../../services/discussion.service.js';
import {
  AnalyzeDiscussionRequestDto,
  AnalyzeDiscussionResponseDto,
} from '../../dto/discussion.dto.js';

@Tags('Discussions')
@Route('api/discussions')
@Service()
export class DiscussionController extends Controller {
  constructor(private service: DiscussionService) {
    super();
  }

  @Post('analyze')
  public async analyze(
    @Body() body: AnalyzeDiscussionRequestDto,
    @Header('X-Trace-Id') traceIdHeader?: string,
  ): Promise<AnalyzeDiscussionResponseDto> {
    const effectiveBody = {
      ...body,
      traceId: traceIdHeader || body.traceId,
    };
    return this.service.analyzeDiscussion(effectiveBody);
  }
}
