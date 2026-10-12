import { requirePrincipal } from '../guards/authorization.js';
import type { Request as ExpressRequest } from 'express';
import { Controller, Route, Tags, Security, Get, Query, Request } from 'tsoa';
import { DashboardService } from '../../services/dashboard.service.js';
import { AuthService } from '../../services/auth.service.js';
import { DashboardDto } from '../../dto/dashboard.dto.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
@Route('api/v1/dashboard')
@Tags('v1 Dashboard')
@Security('jwt')
export class DashboardController extends Controller {
  constructor(
    private readonly dashboard: DashboardService,
    private readonly auth: AuthService,
  ) {
    super();
  }
  @Get()
  async getDashboard(
    @Query() guildId: string,
    @Request() request: ExpressRequest,
  ): Promise<ApiResponse<DashboardDto>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    return apiSuccess(await this.dashboard.summary(guildId));
  }
}
