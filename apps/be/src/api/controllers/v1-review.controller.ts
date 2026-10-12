import { authorizeDecisions, requirePrincipal } from '../guards/authorization.js';
import type { Request as ExpressRequest } from 'express';
import { Controller, Route, Tags, Get, Post, Query, Security, Request, Path, Body } from 'tsoa';
import { Service } from 'typedi';
import { AuthService } from '../../services/auth.service.js';
import { DecisionService } from '../../services/decision.service.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import { toV1Decision, V1DecisionDto } from '../../dto/v1-decision.dto.js';
import { V1ReviewQueueDto, V1ReviewRequestDto } from '../../dto/v1-review.dto.js';

@Tags('v1 Review Queue')
@Route('api/v1/review-queue')
@Security('jwt')
@Service()
export class V1ReviewController extends Controller {
  constructor(
    private service: DecisionService,
    private auth: AuthService,
  ) {
    super();
  }

  @Get()
  public async listV1ReviewQueue(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Query() status: 'IN_REVIEW' | 'ON_HOLD' = 'IN_REVIEW',
    @Query() page: number = 1,
    @Query() size: number = 20,
  ): Promise<ApiResponse<V1ReviewQueueDto>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 100)
      throw new BadRequestError('page must be positive and size between 1 and 100');
    const result = await this.service.browseDecisions({ guildId, status, page, size });
    return apiSuccess({
      pageInfo: result.pageInfo,
      items: result.decisions.map(decision => ({
        ...toV1Decision(decision),
        ticketId: decision.id,
      })),
    });
  }

  /** ticketId and decisionId identify the same entity; review does not create a second record. */
  @Post('{ticketId}/review')
  public async reviewV1Candidate(
    @Request() request: ExpressRequest,
    @Path() ticketId: string,
    @Query() guildId: string,
    @Body() body: V1ReviewRequestDto,
  ): Promise<ApiResponse<V1DecisionDto>> {
    await authorizeDecisions(this.auth, request, guildId, [
      ticketId,
      ...(body.predecessorId ? [body.predecessorId] : []),
    ]);
    const { action, ...params } = body;
    const updated = await this.service.reviewDecision(ticketId, action, {
      ...params,
      approvedBy: requirePrincipal(request).userId,
    });
    if (!updated) throw new NotFoundError('Decision Candidate not found');
    return apiSuccess(toV1Decision(updated));
  }
}
