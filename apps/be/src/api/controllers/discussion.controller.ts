import { Controller, Route, Tags, Post, Body, Header, Get, Path, Security } from 'tsoa';
import { Service } from 'typedi';
import { DiscussionService } from '../../services/discussion.service.js';
import { CandidateHistoryEntry } from '../../repositories/analysis-request.repository.js';
import {
  AnalyzeDiscussionRequestDto,
  AnalyzeDiscussionResponseDto,
} from '../../dto/discussion.dto.js';

@Tags('Discussions')
@Route('api/discussions')
@Security('service')
@Service()
export class DiscussionController extends Controller {
  constructor(private service: DiscussionService) {
    super();
  }

  @Get('history/{decisionId}')
  public async history(@Path() decisionId: string): Promise<CandidateHistoryEntry[]> {
    return this.service.getCandidateHistory(decisionId);
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
