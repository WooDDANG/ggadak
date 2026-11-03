import { Body, Controller, Post, Route, Security, Tags } from 'tsoa';
import { GuildAccessEventSchema, type GuildAccessEvent } from '@ggaddak/shared';
import { GuildAccessService } from '../../services/guild-access.service.js';
import { apiSuccess, type ApiResponse } from '../../dto/api-response.dto.js';
import { AppError } from '../../errors/AppError.js';

@Route('api/v1/internal/guild-access')
@Tags('Internal Guild Access')
@Security('service')
export class GuildAccessController extends Controller {
  constructor(private access: GuildAccessService) {
    super();
  }

  @Post('events')
  async observe(
    @Body() body: GuildAccessEvent,
  ): Promise<ApiResponse<{ sequence: number; resetRequired?: boolean }>> {
    const result = GuildAccessEventSchema.safeParse(body);
    if (!result.success) throw new AppError('Invalid Gateway access event', 400);
    const acknowledgement = await this.access.observe(result.data);
    if (acknowledgement.resetRequired)
      throw new AppError('Gateway events are missing; reset required', 409);
    return apiSuccess(acknowledgement);
  }
}
