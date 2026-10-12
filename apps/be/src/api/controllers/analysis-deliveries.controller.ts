import type { Request as ExpressRequest } from 'express';
import { Controller, Route, Tags, Security, Get, Post, Body, Path, Query, Request } from 'tsoa';
import { Service } from 'typedi';
import { requirePrincipal } from '../guards/authorization.js';
import { AuthService } from '../../services/auth.service.js';
import {
  AnalysisDeliveryService,
  AnalysisDeliveryStatus,
} from '../../services/analysis-delivery.service.js';
import {
  AnalysisDeliveryQueueDto,
  AnalysisRetryCommandDto,
} from '../../dto/analysis-delivery.dto.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';

@Service()
@Tags('Analysis Deliveries')
@Route('api/v1/analysis-deliveries')
@Security('jwt')
export class AnalysisDeliveriesController extends Controller {
  constructor(
    private deliveries: AnalysisDeliveryService,
    private auth: AuthService,
  ) {
    super();
  }
  @Get()
  async list(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
  ): Promise<ApiResponse<AnalysisDeliveryQueueDto>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    return apiSuccess(await this.deliveries.list(guildId));
  }
  @Post('{requestId}/retry')
  async retry(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Path() requestId: string,
    @Body() body: { commandId: string },
  ): Promise<ApiResponse<AnalysisRetryCommandDto>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId, true);
    this.setStatus(202);
    return apiSuccess(await this.deliveries.retry(guildId, requestId, body.commandId));
  }
}

@Service()
@Tags('Internal Analysis Deliveries')
@Route('api/v1/internal/analysis-deliveries')
@Security('service')
export class InternalAnalysisDeliveriesController extends Controller {
  constructor(private deliveries: AnalysisDeliveryService) {
    super();
  }
  @Post('sync')
  async synchronize(
    @Body() body: { requests: AnalysisDeliveryStatus[] },
  ): Promise<ApiResponse<AnalysisRetryCommandDto[]>> {
    return apiSuccess(await this.deliveries.synchronize(body.requests));
  }
  @Post('retries/{id}/ack')
  async acknowledge(@Path() id: string): Promise<ApiResponse<null>> {
    await this.deliveries.acknowledge(id);
    return apiSuccess(null);
  }
}
