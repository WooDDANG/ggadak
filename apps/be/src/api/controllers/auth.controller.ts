import { AuthError } from '../../errors/AuthError.js';
import { requirePrincipal } from '../guards/authorization.js';
import type { AuthUserDto } from '../../dto/auth.dto.js';
import { Controller, Route, Tags, Get, Post, Request, Body, Security } from 'tsoa';
import type { Request as ExpressRequest } from 'express';
import { Service } from 'typedi';
import { AuthService } from '../../services/auth.service.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import { DiscordGuild } from '../../adapters/discord-auth.adapter.js';
@Tags('Auth')
@Route('api/v1/auth')
@Service()
export class AuthController extends Controller {
  constructor(private auth: AuthService) {
    super();
  }
  @Get('authorize')
  async authorizeDiscord(): Promise<ApiResponse<{ url: string }>> {
    const result = await this.auth.authorize();
    this.setHeader('Set-Cookie', result.cookie);
    this.setHeader('Cache-Control', 'no-store');
    return apiSuccess({ url: result.url });
  }
  @Post('login')
  async loginDiscord(
    @Body() body: { code: string; state: string },
    @Request() request: ExpressRequest,
  ): Promise<
    ApiResponse<{ accessToken: string; tokenType: string; expiresAt: string; user: AuthUserDto }>
  > {
    if (request.headers.origin) this.auth.requireBrowserOrigin(request.headers.origin);
    const { sessionCookie, ...result } = await this.auth.login(
      body.code,
      body.state,
      request.headers.cookie,
    );
    this.setHeader('Set-Cookie', [
      'ggaddak_oauth=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0',
      sessionCookie,
    ]);
    this.setHeader('Cache-Control', 'no-store');
    return apiSuccess(result);
  }
  @Post('session')
  async restoreBrowserSession(
    @Request() request: ExpressRequest,
  ): Promise<
    ApiResponse<{
      accessToken: string;
      tokenType: string;
      expiresAt: string;
      user: AuthUserDto;
      guilds: DiscordGuild[];
    }>
  > {
    this.setHeader('Cache-Control', 'no-store');
    this.auth.requireBrowserOrigin(request.headers.origin);
    return apiSuccess(await this.auth.restore(request.headers.cookie));
  }
  @Security('jwt')
  @Get('me')
  async getCurrentUser(@Request() request: ExpressRequest): Promise<ApiResponse<AuthUserDto>> {
    return apiSuccess(await this.auth.me(requirePrincipal(request)));
  }
  @Security('jwt')
  @Get('guilds')
  async listAuthGuilds(
    @Request() request: ExpressRequest,
  ): Promise<ApiResponse<{ guilds: DiscordGuild[] }>> {
    return apiSuccess({ guilds: await this.auth.guilds(requirePrincipal(request)) });
  }
  @Security('jwt')
  @Post('refresh')
  async refreshSession(
    @Request() request: ExpressRequest,
  ): Promise<ApiResponse<{ accessToken: string; tokenType: string; expiresAt: string }>> {
    this.setHeader('Cache-Control', 'no-store');
    return apiSuccess(await this.auth.refresh(requirePrincipal(request)));
  }
  @Post('logout')
  async logoutSession(@Request() request: ExpressRequest): Promise<ApiResponse<null>> {
    let principal;
    if (this.auth.hasBrowserCookie(request.headers.cookie)) {
      this.auth.requireBrowserOrigin(request.headers.origin);
      try {
        principal = await this.auth.browserPrincipal(request.headers.cookie);
      } catch (error) {
        if (!(error instanceof AuthError) || error.statusCode !== 401) throw error;
      }
    } else {
      principal = await this.auth.authenticate(request.headers.authorization);
    }
    if (principal) await this.auth.logout(principal);
    this.setHeader('Set-Cookie', this.auth.clearBrowserCookie());
    this.setHeader('Cache-Control', 'no-store');
    return apiSuccess(null);
  }
}
