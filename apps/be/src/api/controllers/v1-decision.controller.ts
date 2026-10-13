import { CandidateHistoryEntry } from '../../repositories/analysis-request.repository.js';
import { authorizeDecisions, requirePrincipal } from '../guards/authorization.js';
import { DecisionEditDto } from '../../dto/decision-edit.dto.js';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from '../../services/auth.service.js';
import { Controller, Put, Body, Route, Tags, Get, Query, Security, Request, Path } from 'tsoa';
import { Service } from 'typedi';
import { DecisionService } from '../../services/decision.service.js';
import {
  V1DecisionDto,
  V1DecisionListDto,
  DecisionStatus,
  toV1Decision,
} from '../../dto/v1-decision.dto.js';
import { BadRequestError, NotFoundError } from '../../errors/AppError.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import {
  DecisionTimelineDto,
  DecisionTimelineGroupBy,
  toDecisionTimeline,
} from '../../dto/decision-timeline.dto.js';

@Tags('v1 Decisions')
@Route('api/v1/decisions')
@Security('jwt')
@Service()
export class V1DecisionController extends Controller {
  constructor(
    private service: DecisionService,
    private auth: AuthService,
  ) {
    super();
  }

  @Get('timeline')
  public async getDecisionTimeline(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Query() groupBy: DecisionTimelineGroupBy = 'month',
    @Query() timezone: string = 'UTC',
    @Query() from?: string,
    @Query() to?: string,
  ): Promise<ApiResponse<DecisionTimelineDto>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    const result = await this.service.getConfirmedTimeline({
      guildId,
      groupBy,
      timezone,
      from,
      to,
    });
    return apiSuccess(toDecisionTimeline(result, toV1Decision));
  }

  @Put('{id}')
  public async editV1Decision(
    @Request() request: ExpressRequest,
    @Path() id: string,
    @Query() guildId: string,
    @Body() _body: DecisionEditDto,
  ): Promise<ApiResponse<V1DecisionDto>> {
    await authorizeDecisions(this.auth, request, guildId, [id]);
    // Preserve the raw body for strict Zod validation; TSOA strips additional fields.
    const updated = await this.service.editDecision(
      id,
      request.body as DecisionEditDto,
      requirePrincipal(request).userId,
    );
    if (!updated) throw new NotFoundError('Decision not found');
    return apiSuccess(toV1Decision(updated));
  }

  @Get('{id}/history')
  public async getV1DecisionHistory(
    @Request() request: ExpressRequest,
    @Path() id: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<CandidateHistoryEntry[]>> {
    await authorizeDecisions(this.auth, request, guildId, [id]);
    return apiSuccess(await this.service.getHistory(id));
  }

  @Get('{id}')
  public async getV1Decision(
    @Request() request: ExpressRequest,
    @Path() id: string,
    @Query() guildId: string,
  ): Promise<ApiResponse<V1DecisionDto>> {
    await authorizeDecisions(this.auth, request, guildId, [id]);
    const decision = await this.service.getDecisionById(id);
    if (!decision) throw new NotFoundError('Decision not found');
    return apiSuccess(toV1Decision(decision));
  }

  @Get()
  public async listV1Decisions(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Query() topic?: string,
    @Query() state?: string,
    @Query() categoryTag?: string,
    @Query() status?: DecisionStatus,
    @Query() category?: string,
    @Query() page: number = 1,
    @Query() size: number = 20,
  ): Promise<ApiResponse<V1DecisionListDto>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 100)
      throw new BadRequestError('page must be positive and size between 1 and 100');
    const states: Record<string, DecisionStatus> = {
      Draft: 'IN_REVIEW',
      Proposed: 'IN_REVIEW',
      Discussing: 'IN_REVIEW',
      Decided: 'CONFIRMED',
      Deferred: 'ON_HOLD',
      Rejected: 'DISCARDED',
      Superseded: 'SUPERSEDED',
    };
    if (state && !states[state]) throw new BadRequestError('Unknown decision state');
    const result = await this.service.browseDecisions({
      guildId,
      topic,
      status: status ?? (state ? states[state] : undefined),
      category: category ?? categoryTag,
      page,
      size,
    });
    return apiSuccess({ ...result, items: result.decisions.map(toV1Decision) });
  }
}
