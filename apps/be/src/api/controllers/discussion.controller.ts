import { Controller, Route, Tags, Post, Body } from 'tsoa';
import { Service } from 'typedi';
import { Request, Response, NextFunction } from 'express';
import { DiscussionService } from '../../services/discussion.service.js';
import {
  AnalyzeDiscussionRequestDtoSchema,
  AnalyzeDiscussionRequestDto,
  AnalyzeDiscussionResponseDto,
} from '../../dto/discussion.dto.js';
import { BadRequestError } from '../../errors/AppError.js';

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

  analyzeDiscussion = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parsed = AnalyzeDiscussionRequestDtoSchema.safeParse(req.body);
      if (!parsed.success) {
        throw new BadRequestError('Invalid AnalyzeDiscussion payload', parsed.error.issues);
      }

      const result = await this.service.analyzeDiscussion(parsed.data);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };
}
