import { Controller, Route, Tags, Get, Query } from 'tsoa';
import { Service } from 'typedi';
import { DecisionService } from '../../services/decision.service.js';
import { DecisionListResponseDto } from '../../dto/decision.dto.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';

@Tags('v1 Decisions')
@Route('api/v1/decisions')
@Service()
export class V1DecisionController extends Controller {
  constructor(private service: DecisionService) {
    super();
  }

  @Get()
  public async listV1Decisions(
    @Query() topic?: string,
    @Query() state?: string,
    @Query() categoryTag?: string,
  ): Promise<ApiResponse<DecisionListResponseDto>> {
    return apiSuccess({
      decisions: await this.service.getDecisions({ topic, state, categoryTag }),
    });
  }
}
