import { requirePrincipal } from '../guards/authorization.js';
import { Controller, Route, Tags, Get, Query, Request, Security, Response } from 'tsoa';
import type { Request as ExpressRequest } from 'express';
import { Service } from 'typedi';
import { AuthService } from '../../services/auth.service.js';
import { BotInstallationService } from '../../services/bot-installation.service.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import { BotInstallationStatusDto } from '../../dto/bot-installation.dto.js';

@Tags('Discord')
@Route('api/v1/discord')
@Service()
export class BotInstallationController extends Controller {
  constructor(
    private botInstallationService: BotInstallationService,
    private auth: AuthService,
  ) {
    super();
  }

  @Security('jwt')
  @Get('bot-status')
  @Response<ApiResponse<null>>(400, 'Invalid query')
  @Response<ApiResponse<null>>(401, 'Authentication required')
  @Response<ApiResponse<null>>(403, 'Guild access denied')
  async getBotStatus(
    @Query() guildId: string,
    @Request() request: ExpressRequest,
  ): Promise<ApiResponse<BotInstallationStatusDto>> {
    this.setHeader('Cache-Control', 'no-store');
    const principal = requirePrincipal(request);
    const { canManage } = await this.auth.checkGuildAccess(principal, guildId);
    const data = await this.botInstallationService.getStatus(guildId, canManage);
    return apiSuccess(data);
  }
}
