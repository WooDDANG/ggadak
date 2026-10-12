import { Controller, Route, Tags, Get, Post, Request, Body, Security } from 'tsoa';
import type { Request as ExpressRequest } from 'express';
import { Service } from 'typedi';
import { AuthService, AuthUser } from '../../services/auth.service.js';
import { ApiResponse, apiSuccess } from '../../dto/api-response.dto.js';
import { DiscordIdentity, DiscordGuild } from '../../adapters/discord-auth.adapter.js';
@Tags('Auth')
@Route('api/v1/auth')
@Service()
export class AuthController extends Controller {
  constructor(private auth: AuthService) { super(); }
  @Get('authorize')
  async authorizeDiscord(): Promise<ApiResponse<{ url: string }>> {
    const result = await this.auth.authorize(); this.setHeader('Set-Cookie', result.cookie);
    this.setHeader('Cache-Control', 'no-store');
    return apiSuccess({ url: result.url });
  }
  @Post('login')
  async loginDiscord(@Body() body: { code: string; state: string }, @Request() request: ExpressRequest): Promise<ApiResponse<{ accessToken: string; tokenType: string; expiresAt: string; user: AuthUser }>> {
    const result = await this.auth.login(body.code, body.state, request.headers.cookie);
    this.setHeader('Set-Cookie', 'ggaddak_oauth=; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=0');
    this.setHeader('Cache-Control', 'no-store');
    return apiSuccess(result);
  }
  @Security('jwt') @Get('me')
  async getCurrentUser(@Request() request: ExpressRequest): Promise<ApiResponse<AuthUser>> { return apiSuccess(await this.auth.me(request.user!)); }
  @Security('jwt') @Get('guilds')
  async listAuthGuilds(@Request() request: ExpressRequest): Promise<ApiResponse<{ guilds: DiscordGuild[] }>> { return apiSuccess({ guilds: await this.auth.guilds(request.user!) }); }
  @Security('jwt') @Post('refresh')
  async refreshSession(@Request() request: ExpressRequest): Promise<ApiResponse<{ accessToken: string; tokenType: string; expiresAt: string }>> {
    this.setHeader('Cache-Control', 'no-store'); return apiSuccess(await this.auth.refresh(request.user!));
  }
  @Security('jwt') @Post('logout')
  async logoutSession(@Request() request: ExpressRequest): Promise<ApiResponse<null>> { await this.auth.logout(request.user!); return apiSuccess(null); }
}
