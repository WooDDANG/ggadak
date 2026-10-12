import type { Request as ExpressRequest } from 'express';
import { AuthService, AuthPrincipal } from '../../services/auth.service.js';
import { Controller, Route, Tags, Get, Query, Security, Request, Path } from 'tsoa';
import { Service } from 'typedi';
import { DecisionService } from '../../services/decision.service.js';
import { DecisionListResponseDto, DecisionItemDto } from '../../dto/decision.dto.js';
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
  public async getV1Decision(@Request() request: ExpressRequest, @Path() id: string, @Query() guildId: string): Promise<ApiResponse<DecisionItemDto>> {
    await this.auth.requireDecision(request.user!, id, guildId);
    return apiSuccess((await this.service.getDecisionById(id))!);
  }

  @Get()
  public async listV1Decisions(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Query() topic?: string,
    @Query() state?: string,
    @Query() categoryTag?: string,
  ): Promise<ApiResponse<DecisionListResponseDto>> {
    await this.auth.requireGuild(request.user as AuthPrincipal, guildId);
    return apiSuccess({
      decisions: await this.service.getDecisions({ guildId, topic, state, categoryTag }),
    });
  }
}
