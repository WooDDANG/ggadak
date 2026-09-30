import { Controller, Route, Tags, Post, Body } from 'tsoa';
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
  ): Promise<AnalyzeDiscussionResponseDto> {
    return this.service.analyzeDiscussion(body);
  }
}
