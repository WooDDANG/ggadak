import { Controller, Route, Tags, Get, Post, Body, Query, Path, SuccessResponse } from 'tsoa';
import { Service } from 'typedi';
import { createLogger } from '@ggaddak/shared';
import { DecisionService } from '../../services/decision.service.js';
import {
  DecisionListResponseDto,
  ReviewDecisionResponseDto,
  ReviewDecisionDto,
  ResolveConflictDto,
  DecisionWebhookDto,
} from '../../dto/decision.dto.js';
import { NotFoundError } from '../../errors/AppError.js';

const logger = createLogger('DECISION-CONTROLLER');

@Tags('Decisions')
@Route('api')
@Service()
export class DecisionController extends Controller {
  constructor(private service: DecisionService) {
    super();
  }

  @Get('decisions')
  public async listDecisions(
    @Query() topic?: string,
    @Query() state?: string,
    @Query() categoryTag?: string,
  ): Promise<DecisionListResponseDto> {
    const decisions = this.service.getDecisions({ topic, state, categoryTag });
    return { decisions };
  }

  @Post('decisions/{id}/review')
  public async review(
    @Path() id: string,
    @Body() body: ReviewDecisionDto,
  ): Promise<ReviewDecisionResponseDto> {
    const { action, approvedBy, title, decisionContent, rationale, categoryTag } = body;
    const updated = this.service.reviewDecision(id, action, {
      approvedBy,
      title,
      decisionContent,
      rationale,
      categoryTag,
    });
    if (!updated) {
      throw new NotFoundError(`Decision [${id}] not found`);
    }
    return { status: 'ok', decision: updated };
  }

  @Post('decisions/conflict')
  public async resolve(
    @Body() body: ResolveConflictDto,
  ): Promise<{ status: string }> {
    this.service.resolveConflict(body.decisionId, body.conflictingId, body.resolution);
    return { status: 'ok' };
  }

  @Post('webhooks/decisions')
  @SuccessResponse(201, 'Created')
  public async webhook(
    @Body() body: DecisionWebhookDto,
  ): Promise<{ status: string; id: string }> {
    const decision = body.payload;
    this.service.saveDecision(decision);
    logger.info(`[Webhook] Successfully saved decision [${decision.id}] Topic="${decision.topic}"`);
    return { status: 'ok', id: decision.id };
  }
}
