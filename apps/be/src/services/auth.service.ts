import { createHmac, timingSafeEqual, randomBytes, randomUUID, createHash, createCipheriv, createDecipheriv } from 'node:crypto';
import { Service } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { AppError, NotFoundError } from '../errors/AppError.js';
import { DiscordAuthAdapter, HttpDiscordAuthAdapter } from '../adapters/discord-auth.adapter.js';
export interface AuthUser { id: string; name: string; email: string | null; avatarUrl: string | null; discordUserId: string; }
export interface AuthPrincipal { userId: string; sessionId: string; }
export interface AuthConfig { clientId: string; clientSecret: string; redirectUri: string; secret: string; secureCookie: boolean; }
export interface AuthOptions { channelAdapter?: import("../adapters/discord-channels.adapter.js").DiscordChannelsAdapter; serviceToken?: string; config?: AuthConfig; discordAdapter?: DiscordAuthAdapter; now?: () => number; }
export class AuthError extends AppError { constructor(message = 'Authentication required', status = 401) { super(message, status); } }
const TTL = 15 * 60 * 1000;
@Service()
export class AuthService {
  private config: AuthConfig;
  private discord: DiscordAuthAdapter;
  private now: () => number;
  constructor(private prisma: PrismaClient, options: AuthOptions = {}) {
    this.config = options.config ?? { clientId: process.env.DISCORD_CLIENT_ID ?? '', clientSecret: process.env.DISCORD_CLIENT_SECRET ?? '', redirectUri: process.env.DISCORD_REDIRECT_URI ?? '', secret: process.env.AUTH_SECRET ?? '', secureCookie: process.env.NODE_ENV === 'production' };
    this.discord = options.discordAdapter ?? new HttpDiscordAuthAdapter(this.config.clientId, this.config.clientSecret);
    this.now = options.now ?? Date.now;
  }
  private configured() {
    if (!this.config.clientId || !this.config.clientSecret || this.config.secret.length < 32 || !/^https?:\/\//.test(this.config.redirectUri)) throw new AppError('Discord login is not configured', 503);
  }
  private signature(value: string) { return createHmac('sha256', this.config.secret).update(value).digest('base64url'); }
  private equal(a: string, b: string) { const x = Buffer.from(a); const y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); }
  private encrypt(value: string) {
    const iv = randomBytes(12); const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(this.config.secret).digest(), iv);
    const content = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), content].map(x => x.toString('base64url')).join('.');
  }
  private decrypt(value: string) {
    const [iv, tag, content] = value.split('.').map(x => Buffer.from(x, 'base64url'));
    const cipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(this.config.secret).digest(), iv); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(content), cipher.final()]).toString('utf8');
  }
  async authorize() {
    this.configured();
    const nonce = randomBytes(32).toString('base64url');
    await this.prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date(this.now()) } } });
    await this.prisma.oAuthState.create({ data: { nonce, expiresAt: new Date(this.now() + 5 * 60000) } });
    const state = `${nonce}.${this.signature(nonce)}`;
    const params = new URLSearchParams({ client_id: this.config.clientId, redirect_uri: this.config.redirectUri, response_type: 'code', scope: 'identify guilds', state });
    return { url: `https://discord.com/oauth2/authorize?${params}`, state, cookie: `ggaddak_oauth=${state}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=300${this.config.secureCookie ? '; Secure' : ''}` };
  }
  async login(code: string, state: string, cookie?: string) {
    this.configured();
    if (state.length > 512) throw new AuthError('Invalid OAuth state');
    const bound = cookie?.split(';').map(x => x.trim()).find(x => x.startsWith('ggaddak_oauth='))?.slice('ggaddak_oauth='.length);
    const [nonce, signature, extra] = state.split('.');
    if (!code || code.length > 4096 || !nonce || extra || !signature || !bound || !this.equal(bound, state) || !this.equal(signature, this.signature(nonce))) throw new AuthError('Invalid OAuth state');
    const consumed = await this.prisma.oAuthState.deleteMany({ where: { nonce, expiresAt: { gt: new Date(this.now()) } } });
    if (consumed.count !== 1) throw new AuthError('Expired or previously used OAuth state');
    const tokens = await this.discord.exchange(code, this.config.redirectUri);
    const [user, guilds] = await Promise.all([this.discord.identity(tokens.access_token), this.discord.guilds(tokens.access_token)]);
    const sessionId = randomUUID();
    await this.prisma.$transaction(async tx => {
      await tx.user.upsert({ where: { id: user.id }, create: { id: user.id, username: user.username, avatar: user.avatar }, update: { username: user.username, avatar: user.avatar } });
      await tx.membership.deleteMany({ where: { userId: user.id } });
      for (const guild of guilds) {
        await tx.guild.upsert({ where: { id: guild.id }, create: { id: guild.id, name: guild.name, icon: guild.icon }, update: { name: guild.name, icon: guild.icon } });
        await tx.membership.create({ data: { userId: user.id, guildId: guild.id, owner: guild.owner, permissions: guild.permissions, refreshedAt: new Date(this.now()) } });
      }
      await tx.authSession.create({ data: { id: sessionId, userId: user.id, refreshToken: this.encrypt(tokens.refresh_token), expiresAt: new Date(this.now() + 7 * 86400000), refreshedAt: new Date(this.now()) } });
    });
    return { ...this.token({ userId: user.id, sessionId }), user: this.publicUser(user) };
  }
  private token(user: AuthPrincipal) {
    const expiresAt = new Date(this.now() + TTL).toISOString();
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify({ sub: user.userId, sid: user.sessionId, iss: 'ggaddak', aud: 'ggaddak-web', exp: Math.floor((this.now() + TTL) / 1000) })).toString('base64url');
    return { accessToken: `${head}.${payload}.${this.signature(`${head}.${payload}`)}`, tokenType: 'Bearer' as const, expiresAt };
  }
  async authenticate(header?: string): Promise<AuthPrincipal> {
    if (!header?.startsWith('Bearer ')) throw new AuthError();
    this.configured();
    try {
      if (!header?.startsWith('Bearer ')) throw new Error();
      const [head, body, signature, extra] = header.slice(7).split('.');
      if (!head || !body || !signature || extra || !this.equal(signature, this.signature(`${head}.${body}`))) throw new Error();
      const meta = JSON.parse(Buffer.from(head, 'base64url').toString());
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (meta.alg !== 'HS256' || meta.typ !== 'JWT' || payload.iss !== 'ggaddak' || payload.aud !== 'ggaddak-web' || typeof payload.exp !== 'number' || payload.exp <= this.now() / 1000 || typeof payload.sub !== 'string' || typeof payload.sid !== 'string') throw new Error();
      const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
      if (!session || session.userId !== payload.sub || session.expiresAt.getTime() <= this.now()) throw new Error();
      return { userId: payload.sub, sessionId: payload.sid };
    } catch { throw new AuthError(); }
  }
  async requireGuild(user: AuthPrincipal, guildId: string, manage = false): Promise<void> {
    const membership = await this.prisma.membership.findUnique({ where: { userId_guildId: { userId: user.userId, guildId } } });
    const session = await this.prisma.authSession.findUnique({ where: { id: user.sessionId } });
    if (!membership || !session || session.userId !== user.userId || session.expiresAt.getTime() <= this.now() || session.refreshedAt.getTime() + TTL <= this.now() || membership.refreshedAt.getTime() + TTL <= this.now()) throw new AuthError('Guild access denied; refresh login', 403);
    if (manage && !membership.owner && (!/^\d+$/.test(membership.permissions) || (BigInt(membership.permissions) & 32n) === 0n)) throw new AuthError('Manage Server permission required', 403);
  }
  async requireDecision(user: AuthPrincipal, id: string, guildId?: string) {
    const decision = await this.prisma.decision.findUnique({ where: { id }, select: { guildId: true } });
    if (!decision) throw new NotFoundError('Decision not found');
    await this.requireGuild(user, decision.guildId);
    if (guildId !== undefined && decision.guildId !== guildId) throw new AuthError('Decision belongs to another guild', 403);
    return decision.guildId;
  }
  private publicUser(user: { id: string; username: string; avatar: string | null }): AuthUser { return { id: user.id, name: user.username, email: null, discordUserId: user.id, avatarUrl: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : null }; }
  async me(user: AuthPrincipal) { return this.publicUser(await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } })); }
  async guilds(user: AuthPrincipal) {
    const membership = await this.prisma.membership.findMany({ where: { userId: user.userId, refreshedAt: { gt: new Date(this.now() - TTL) } }, include: { guild: true } });
    return membership.map(m => ({ ...m.guild, owner: m.owner, permissions: m.permissions }));
  }
  async refresh(user: AuthPrincipal) {
    const session = await this.prisma.authSession.findUniqueOrThrow({ where: { id: user.sessionId } });
    const tokens = await this.discord.refresh(this.decrypt(session.refreshToken));
    const guilds = await this.discord.guilds(tokens.access_token);
    await this.prisma.$transaction(async tx => {
      await tx.membership.deleteMany({ where: { userId: user.userId } });
      for (const guild of guilds) {
        await tx.guild.upsert({ where: { id: guild.id }, create: { id: guild.id, name: guild.name, icon: guild.icon }, update: { name: guild.name, icon: guild.icon } });
        await tx.membership.create({ data: { userId: user.userId, guildId: guild.id, owner: guild.owner, permissions: guild.permissions, refreshedAt: new Date(this.now()) } });
      }
      await tx.authSession.update({ where: { id: user.sessionId }, data: { refreshToken: this.encrypt(tokens.refresh_token), refreshedAt: new Date(this.now()) } });
    });
    return this.token(user);
  }
  async logout(user: AuthPrincipal) { await this.prisma.authSession.deleteMany({ where: { id: user.sessionId, userId: user.userId } }); }
}
