import { requirePrincipal } from '../guards/authorization.js';
import { Controller, Route, Tags, Get, Put, Body, Query, Request, Security } from 'tsoa';
import type { Request as ExpressRequest } from 'express';
import { Service } from 'typedi';
import { AuthService } from '../../services/auth.service.js';
import { ChannelsService } from '../../services/channels.service.js';
import { DiscordChannel } from '../../adapters/discord-channels.adapter.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
interface ChannelSettings {
  channels: DiscordChannel[];
  monitoredChannelIds: string[];
}
@Tags('Discord')
@Route('api/v1/discord')
@Service()
export class ChannelsController extends Controller {
  constructor(
    private channels: ChannelsService,
    private auth: AuthService,
  ) {
    super();
  }
  @Security('jwt')
  @Get('channels')
  async listDiscordChannels(
    @Query() guildId: string,
    @Request() request: ExpressRequest,
  ): Promise<ApiResponse<ChannelSettings>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    return apiSuccess(await this.channels.list(guildId));
  }
  @Security('jwt')
  @Put('channels')
  async saveDiscordChannels(
    @Query() guildId: string,
    @Body() body: { channelIds: string[] },
    @Request() request: ExpressRequest,
  ): Promise<ApiResponse<ChannelSettings>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId, true);
    return apiSuccess(await this.channels.save(guildId, body.channelIds));
  }
}
@Tags('Internal')
@Route('api/v1/internal')
@Service()
export class InternalMonitoringController extends Controller {
  constructor(private channels: ChannelsService) {
    super();
  }
  @Security('service')
  @Get('monitoring')
  async getMonitoredChannels(
    @Query() guildId: string,
  ): Promise<ApiResponse<{ channelIds: string[] }>> {
    return apiSuccess({ channelIds: await this.channels.monitored(guildId) });
  }
}
