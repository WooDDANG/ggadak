import { requirePrincipal } from '../guards/authorization.js';
import type { Request as ExpressRequest } from 'express';
import { Controller, Route, Tags, Get, Query, Security, Request } from 'tsoa';
import { AuthService } from '../../services/auth.service.js';
import { SearchService, SearchResponse } from '../../services/search.service.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';

@Tags('Why Search')
@Route('api/v1/search')
@Security('jwt')
export class SearchController extends Controller {
  constructor(
    private service: SearchService,
    private auth: AuthService,
  ) {
    super();
  }
  /** Semantic search of CONFIRMED and SUPERSEDED decisions in one authorized guild. */
  @Get()
  async searchDecisions(
    @Request() request: ExpressRequest,
    @Query() guildId: string,
    @Query() query: string,
    @Query() limit: number = 10,
  ): Promise<ApiResponse<SearchResponse>> {
    await this.auth.requireGuild(requirePrincipal(request), guildId);
    return apiSuccess(await this.service.search(guildId, query, limit));
  }
}
