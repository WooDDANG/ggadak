import type { Request as ExpressRequest } from 'express';
import { AuthService, AuthPrincipal } from '../../services/auth.service.js';
import { Controller, Route, Tags, Get, Query, Security, Request, Path } from 'tsoa';
import { Service } from 'typedi';
import { DecisionService } from '../../services/decision.service.js';
import { V1DecisionDto, V1DecisionListDto, DecisionStatus, toV1Decision } from '../../dto/v1-decision.dto.js';
import { BadRequestError } from '../../errors/AppError.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';

@Tags('v1 Decisions')
@Route('api/v1/decisions')
@Security('jwt')
@Service()
export class V1DecisionController extends Controller {
  constructor(private service: DecisionService, private auth: AuthService) {
    super();
  }

  @Get('{id}')
  public async getV1Decision(@Request() request: ExpressRequest, @Path() id: string, @Query() guildId: string): Promise<ApiResponse<V1DecisionDto>> {
    await this.auth.requireDecision(request.user!, id, guildId);
    return apiSuccess(toV1Decision((await this.service.getDecisionById(id))!));
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
    await this.auth.requireGuild(request.user as AuthPrincipal, guildId);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(size) || size < 1 || size > 100)
      throw new BadRequestError('page must be positive and size between 1 and 100');
    const states: Record<string, DecisionStatus> = {Draft: 'IN_REVIEW', Proposed: 'IN_REVIEW', Discussing: 'IN_REVIEW', Decided: 'CONFIRMED', Deferred: 'ON_HOLD', Rejected: 'DISCARDED', Superseded: 'SUPERSEDED'};
    if (state && !states[state]) throw new BadRequestError('Unknown decision state');
    const result = await this.service.browseDecisions({guildId, topic, status: status ?? (state ? states[state] : undefined), category: category ?? categoryTag, page, size});
    return apiSuccess({...result, items: result.decisions.map(toV1Decision)});
  }
}
