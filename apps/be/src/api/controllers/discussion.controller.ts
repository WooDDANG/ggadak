import { Controller, Route, Tags, Post, Body, Header, Get, Path, Security } from 'tsoa';
import { Service } from 'typedi';
import { z } from 'zod';
import { BadRequestError } from '../../errors/AppError.js';
import { DiscussionService } from '../../services/discussion.service.js';
import { CandidateHistoryEntry } from '../../repositories/analysis-request.repository.js';
import {
  AnalyzeDiscussionRequestDto,
  AnalyzeDiscussionResponseDto,
} from '../../dto/discussion.dto.js';

const messageId = z.string().regex(/^\d+$/).max(20);
const scanRangeSchema = z.object({
  afterMessageId: messageId,
  startMessageId: messageId,
  endMessageId: messageId,
});

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
    @Header('X-Scan-Range') scanRangeHeader?: string,
  ): Promise<AnalyzeDiscussionResponseDto> {
    const effectiveBody = {
      ...body,
      traceId: traceIdHeader || body.traceId,
    };
    if (!scanRangeHeader) return this.service.analyzeDiscussion(effectiveBody);
    try {
      const range = scanRangeSchema.parse(JSON.parse(scanRangeHeader));
      if (
        !body.guildId ||
        !body.channelId ||
        range.startMessageId !== body.rawMessages[0]?.id ||
        range.endMessageId !== body.rawMessages.at(-1)?.id ||
        BigInt(range.afterMessageId) >= BigInt(range.startMessageId) ||
        BigInt(range.startMessageId) > BigInt(range.endMessageId)
      )
        throw new Error('Invalid scan range');
      return this.service.analyzeDiscussion(effectiveBody, { scanRange: range });
    } catch {
      throw new BadRequestError('Invalid scan range');
    }
  }
}
