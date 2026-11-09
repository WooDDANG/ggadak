import { AuthPolicy } from '../config/policies.js';
import type { AuthUserDto, AuthPrincipal } from '../dto/auth.dto.js';
import { AuthError } from '../errors/AuthError.js';
import { config, validateAuthConfig, type AuthConfig } from '../config/index.js';
import type { DiscordChannelsAdapter } from '../adapters/discord-channels.adapter.js';
import type { DiscordBotInstallationAdapter } from '../adapters/discord-bot-installation.adapter.js';
import {
  createHmac,
  timingSafeEqual,
  randomBytes,
  randomUUID,
  createHash,
  createCipheriv,
  createDecipheriv,
} from 'node:crypto';
import { Service } from 'typedi';
import { PrismaClient } from '@prisma/client';
import { AppError, NotFoundError } from '../errors/AppError.js';
import {
  DiscordAuthAdapter,
  HttpDiscordAuthAdapter,
  type DiscordGuild,
} from '../adapters/discord-auth.adapter.js';
import { GuildAccessService } from './guild-access.service.js';
import { GuildAccessRepository } from '../repositories/guild-access.repository.js';
import { GuildAccessError } from '../errors/GuildAccessError.js';
import { InstalledGuildsService } from './installed-guilds.service.js';
import {
  HttpDiscordBotInstallationAdapter,
  type DiscordGuildInventoryAdapter,
} from '../adapters/discord-bot-installation.adapter.js';
export interface AuthOptions {
  channelAdapter?: DiscordChannelsAdapter;
  botInstallationAdapter?: DiscordBotInstallationAdapter;
  serviceToken?: string;
  config?: AuthConfig;
  discordAdapter?: DiscordAuthAdapter;
  now?: () => number;
  guildAccess?: GuildAccessService;
  guildInventoryAdapter?: DiscordGuildInventoryAdapter;
}
@Service()
export class AuthService {
  private config: AuthConfig;
  private discord: DiscordAuthAdapter;
  private now: () => number;
  private access: GuildAccessService;
  private installed: InstalledGuildsService;
  private verifications = new Map<string, Promise<void>>();
  constructor(
    private prisma: PrismaClient,
    options: AuthOptions = {},
  ) {
    this.config = options.config ?? config.auth;
    this.discord =
      options.discordAdapter ??
      new HttpDiscordAuthAdapter(this.config.clientId, this.config.clientSecret);
    this.now = options.now ?? Date.now;
    this.access =
      options.guildAccess ?? new GuildAccessService(new GuildAccessRepository(prisma), this.now);
    this.installed = new InstalledGuildsService(
      this.access,
      options.guildInventoryAdapter ?? new HttpDiscordBotInstallationAdapter(),
      this.now,
    );
  }
  private configured() {
    validateAuthConfig(this.config);
  }
  private signature(value: string) {
    return createHmac('sha256', this.config.secret).update(value).digest('base64url');
  }
  private equal(a: string, b: string) {
    const x = Buffer.from(a);
    const y = Buffer.from(b);
    return x.length === y.length && timingSafeEqual(x, y);
  }
  private encrypt(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      createHash('sha256').update(this.config.secret).digest(),
      iv,
    );
    const content = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), content].map(x => x.toString('base64url')).join('.');
  }
  private decrypt(value: string) {
    const [iv, tag, content] = value.split('.').map(x => Buffer.from(x, 'base64url'));
    const cipher = createDecipheriv(
      'aes-256-gcm',
      createHash('sha256').update(this.config.secret).digest(),
      iv,
    );
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(content), cipher.final()]).toString('utf8');
  }
  async authorize() {
    this.configured();
    const nonce = randomBytes(32).toString('base64url');
    await this.prisma.oAuthState.deleteMany({ where: { expiresAt: { lt: new Date(this.now()) } } });
    await this.prisma.oAuthState.create({
      data: { nonce, expiresAt: new Date(this.now() + AuthPolicy.oauthStateTtlMs) },
    });
    const state = `${nonce}.${this.signature(nonce)}`;
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state,
    });
    return {
      url: `https://discord.com/oauth2/authorize?${params}`,
      state,
      cookie: `ggaddak_oauth=${state}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=300${this.config.secureCookie ? '; Secure' : ''}`,
    };
  }
  async login(code: string, state: string, cookie?: string) {
    this.configured();
    if (state.length > 512) throw new AuthError('Invalid OAuth state');
    const bound = cookie
      ?.split(';')
      .map(x => x.trim())
      .find(x => x.startsWith('ggaddak_oauth='))
      ?.slice('ggaddak_oauth='.length);
    const [nonce, signature, extra] = state.split('.');
    if (
      !code ||
      code.length > 4096 ||
      !nonce ||
      extra ||
      !signature ||
      !bound ||
      !this.equal(bound, state) ||
      !this.equal(signature, this.signature(nonce))
    )
      throw new AuthError('Invalid OAuth state');
    const consumed = await this.prisma.oAuthState.deleteMany({
      where: { nonce, expiresAt: { gt: new Date(this.now()) } },
    });
    if (consumed.count !== 1) throw new AuthError('Expired or previously used OAuth state');
    const revision = await this.access.revision();
    const tokens = await this.discord.exchange(code, this.config.redirectUri);
    const user = await this.discord.identity(tokens.access_token);
    const cooldown = await this.activeCooldown(user.id);
    let fetchedGuilds: DiscordGuild[] | null = null;
    if (!cooldown) {
      try {
        fetchedGuilds = await this.discord.guilds(tokens.access_token);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 429) {
          const details = (error.details as { retryAfterMs?: number; global?: boolean }) ?? {};
          await this.recordCooldown(user.id, details.retryAfterMs, details.global);
        } else {
          throw error;
        }
      }
    }
    const sessionId = randomUUID();
    const browserToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(this.now() + AuthPolicy.sessionTtlMs);
    await this.prisma.$transaction(async tx => {
      await tx.user.upsert({
        where: { id: user.id },
        create: { id: user.id, username: user.username, avatar: user.avatar },
        update: { username: user.username, avatar: user.avatar },
      });
      if (fetchedGuilds !== null) {
        await this.access.replaceMemberships(tx, user.id, fetchedGuilds, revision);
      }
      await tx.authSession.create({
        data: {
          id: sessionId,
          browserTokenHash: this.browserHash(browserToken),
          userId: user.id,
          refreshToken: this.encrypt(tokens.refresh_token),
          expiresAt,
          refreshedAt: new Date(this.now()),
        },
      });
    });
    const coverage = await this.access.eventCoverage();
    const currentCooldown = await this.activeCooldown(user.id);
    if (currentCooldown) {
      return {
        ...this.token({ userId: user.id, sessionId }, expiresAt.getTime()),
        user: this.publicUser(user),
        guilds: [],
        guildSelection: { status: 'unavailable' as const, checkedAt: null },
        guildVerification: {
          status: 'rate_limited' as const,
          retryAt: currentCooldown.retryUntil,
          eventCoverage: coverage,
        },
        sessionCookie: this.browserCookie(browserToken, expiresAt),
      };
    }
    const selection = await this.installed.select(
      await this.cachedGuilds({ userId: user.id, sessionId }),
      revision,
    );
    return {
      ...this.token({ userId: user.id, sessionId }, expiresAt.getTime()),
      user: this.publicUser(user),
      ...selection,
      guildVerification: {
        status:
          selection.guildSelection.status === 'ready'
            ? ('ready' as const)
            : ('unavailable' as const),
        retryAt: null,
        eventCoverage: coverage,
      },
      sessionCookie: this.browserCookie(browserToken, expiresAt),
    };
  }
  private token(user: AuthPrincipal, sessionExpiry = Infinity) {
    const expiresAt = new Date(
      Math.min(this.now() + AuthPolicy.accessTokenTtlMs, sessionExpiry),
    ).toISOString();
    const head = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: user.userId,
        sid: user.sessionId,
        iss: 'ggaddak',
        aud: 'ggaddak-web',
        exp: Math.floor(new Date(expiresAt).getTime() / 1000),
      }),
    ).toString('base64url');
    return {
      accessToken: `${head}.${payload}.${this.signature(`${head}.${payload}`)}`,
      tokenType: 'Bearer' as const,
      expiresAt,
    };
  }
  async authenticate(header?: string): Promise<AuthPrincipal> {
    if (!header?.startsWith('Bearer ')) throw new AuthError();
    this.configured();
    try {
      if (!header?.startsWith('Bearer ')) throw new Error();
      const [head, body, signature, extra] = header.slice(7).split('.');
      if (
        !head ||
        !body ||
        !signature ||
        extra ||
        !this.equal(signature, this.signature(`${head}.${body}`))
      )
        throw new Error();
      const meta = JSON.parse(Buffer.from(head, 'base64url').toString());
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
      if (
        meta.alg !== 'HS256' ||
        meta.typ !== 'JWT' ||
        payload.iss !== 'ggaddak' ||
        payload.aud !== 'ggaddak-web' ||
        typeof payload.exp !== 'number' ||
        payload.exp <= this.now() / 1000 ||
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string'
      )
        throw new Error();
      const session = await this.prisma.authSession.findUnique({ where: { id: payload.sid } });
      if (!session || session.userId !== payload.sub || session.expiresAt.getTime() <= this.now())
        throw new Error();
      return { userId: payload.sub, sessionId: payload.sid };
    } catch {
      throw new AuthError();
    }
  }
  async checkGuildAccess(user: AuthPrincipal, guildId: string): Promise<{ canManage: boolean }> {
    const revision = await this.access.revision();
    let membership = await this.prisma.membership.findUnique({
      where: { userId_guildId: { userId: user.userId, guildId } },
    });
    const session = await this.prisma.authSession.findUnique({ where: { id: user.sessionId } });
    if (!session || session.userId !== user.userId || session.expiresAt.getTime() <= this.now())
      throw new AuthError('Guild access denied; refresh login', 403);
    if (await this.access.removed(user.userId, guildId)) throw new GuildAccessError();
    if (!membership || !(await this.access.trusted(membership))) {
      await this.verifyGuilds(user);
      membership = await this.prisma.membership.findUnique({
        where: { userId_guildId: { userId: user.userId, guildId } },
      });
    }
    if (!membership || (await this.access.removed(user.userId, guildId)))
      throw new GuildAccessError();
    if ((await this.access.revision()) !== revision)
      throw new GuildAccessError(
        'Discord permissions changed during authorization; retry shortly',
        503,
      );
    const canManage =
      Boolean(membership.owner) ||
      (/^\d+$/.test(membership.permissions) && (BigInt(membership.permissions) & 32n) !== 0n);
    return { canManage };
  }
  async requireGuild(user: AuthPrincipal, guildId: string, manage = false): Promise<void> {
    const { canManage } = await this.checkGuildAccess(user, guildId);
    if (manage && !canManage) throw new GuildAccessError('Manage Server permission required');
  }
  async requireDecision(user: AuthPrincipal, id: string, guildId?: string) {
    const decision = await this.prisma.decision.findUnique({
      where: { id },
      select: { guildId: true },
    });
    if (!decision) throw new NotFoundError('Decision not found');
    await this.requireGuild(user, decision.guildId);
    if (guildId !== undefined && decision.guildId !== guildId)
      throw new AuthError('Decision belongs to another guild', 403);
    return decision.guildId;
  }
  private publicUser(user: { id: string; username: string; avatar: string | null }): AuthUserDto {
    return {
      id: user.id,
      name: user.username,
      email: null,
      discordUserId: user.id,
      avatarUrl: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`
        : null,
    };
  }
  async me(user: AuthPrincipal) {
    return this.publicUser(
      await this.prisma.user.findUniqueOrThrow({ where: { id: user.userId } }),
    );
  }
  async guilds(user: AuthPrincipal) {
    return (await this.selectableGuilds(user)).guilds;
  }
  async activeCooldown(userId?: string): Promise<{ retryUntil: string; isGlobal: boolean } | null> {
    const ids = userId ? [`user:${userId}`, 'global'] : ['global'];
    const records = await this.prisma.storageArchive.findMany({
      where: {
        kind: 'guild_verification_cooldown',
        id: { in: ids },
      },
    });
    let latest: { retryUntil: string; isGlobal: boolean; timestamp: number } | null = null;
    const now = this.now();
    for (const record of records) {
      try {
        const data = JSON.parse(record.dataJson);
        const time = new Date(data.retryUntil).getTime();
        if (time > now && (!latest || time > latest.timestamp)) {
          latest = {
            retryUntil: data.retryUntil,
            isGlobal: Boolean(data.isGlobal),
            timestamp: time,
          };
        }
      } catch {
        // ignore malformed record
      }
    }
    return latest ? { retryUntil: latest.retryUntil, isGlobal: latest.isGlobal } : null;
  }
  async recordCooldown(userId: string, retryAfterMs?: number, isGlobal = false): Promise<string> {
    const delay =
      Number.isFinite(retryAfterMs) && (retryAfterMs as number) > 0
        ? Math.ceil(retryAfterMs as number)
        : 30000;
    const retryUntil = new Date(this.now() + delay);
    const scopeId = isGlobal ? 'global' : `user:${userId}`;
    await this.prisma.storageArchive.upsert({
      where: { kind_id: { kind: 'guild_verification_cooldown', id: scopeId } },
      create: {
        kind: 'guild_verification_cooldown',
        id: scopeId,
        dataJson: JSON.stringify({ retryUntil: retryUntil.toISOString(), isGlobal }),
      },
      update: {
        dataJson: JSON.stringify({ retryUntil: retryUntil.toISOString(), isGlobal }),
      },
    });
    return retryUntil.toISOString();
  }
  async selectableGuilds(user: AuthPrincipal) {
    const coverage = await this.access.eventCoverage();
    const cooldown = await this.activeCooldown(user.userId);
    if (cooldown) {
      return {
        guilds: [],
        guildSelection: { status: 'unavailable' as const, checkedAt: null },
        guildVerification: {
          status: 'rate_limited' as const,
          retryAt: cooldown.retryUntil,
          eventCoverage: coverage,
        },
      };
    }
    const revision = await this.access.revision();
    if (!(await this.access.snapshotTrusted(user.userId))) {
      try {
        await this.verifyGuilds(user);
      } catch (error) {
        if (error instanceof AppError && error.statusCode === 429) {
          const currentCooldown = await this.activeCooldown(user.userId);
          return {
            guilds: [],
            guildSelection: { status: 'unavailable' as const, checkedAt: null },
            guildVerification: {
              status: 'rate_limited' as const,
              retryAt: currentCooldown?.retryUntil ?? null,
              eventCoverage: coverage,
            },
          };
        }
        throw error;
      }
    }
    const guilds = await this.cachedGuilds(user);
    if ((await this.access.revision()) !== revision)
      throw new GuildAccessError(
        'Discord permissions changed during authorization; retry shortly',
        503,
      );
    const selection = await this.installed.select(guilds, revision);
    return {
      ...selection,
      guildVerification: {
        status:
          selection.guildSelection.status === 'ready'
            ? ('ready' as const)
            : ('unavailable' as const),
        retryAt: null,
        eventCoverage: coverage,
      },
    };
  }
  private async cachedGuilds(user: AuthPrincipal) {
    const membership = await this.prisma.membership.findMany({
      where: { userId: user.userId },
      include: { guild: true },
    });
    return membership.map(m => ({ ...m.guild, owner: m.owner, permissions: m.permissions }));
  }
  private browserHash(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }
  private browserCookie(token: string, expiresAt: Date) {
    const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - this.now()) / 1000));
    return `ggaddak_session=${token}; HttpOnly; SameSite=Lax; Path=/api/v1/auth; Max-Age=${maxAge}; Expires=${expiresAt.toUTCString()}${this.config.secureCookie ? '; Secure' : ''}`;
  }
  clearBrowserCookie() {
    return this.browserCookie('', new Date(0));
  }
  requireBrowserOrigin(origin?: string) {
    this.configured();
    if (!origin || origin !== new URL(this.config.redirectUri).origin)
      throw new AuthError('Browser origin is not allowed', 403);
  }
  hasBrowserCookie(cookie?: string) {
    return cookie?.split(';').some(part => part.trim().startsWith('ggaddak_session=')) ?? false;
  }
  async browserPrincipal(cookie?: string): Promise<AuthPrincipal> {
    this.configured();
    const token = cookie
      ?.split(';')
      .map(part => part.trim())
      .find(part => part.startsWith('ggaddak_session='))
      ?.slice('ggaddak_session='.length);
    if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw new AuthError();
    const session = await this.prisma.authSession.findUnique({
      where: { browserTokenHash: this.browserHash(token) },
    });
    if (!session || session.expiresAt.getTime() <= this.now()) throw new AuthError();
    return { userId: session.userId, sessionId: session.id };
  }
  async restore(cookie?: string) {
    const principal = await this.browserPrincipal(cookie);
    const selection = await this.selectableGuilds(principal);
    return { ...(await this.refresh(principal)), user: await this.me(principal), ...selection };
  }
  async refresh(user: AuthPrincipal) {
    const session = await this.prisma.authSession.findUnique({ where: { id: user.sessionId } });
    if (!session || session.userId !== user.userId || session.expiresAt.getTime() <= this.now())
      throw new AuthError();
    return this.token(user, session.expiresAt.getTime());
  }
  async renewBrowser(cookie?: string) {
    const principal = await this.browserPrincipal(cookie);
    return { ...(await this.refresh(principal)), userId: principal.userId };
  }
  private async verifyGuilds(user: AuthPrincipal): Promise<void> {
    const cooldown = await this.activeCooldown(user.userId);
    if (cooldown) {
      const retryAfterMs = Math.max(0, new Date(cooldown.retryUntil).getTime() - this.now());
      throw new GuildAccessError('Discord rate limit reached; retry shortly', 429, {
        retryAfterMs,
        retryAt: cooldown.retryUntil,
        global: cooldown.isGlobal,
      });
    }
    const existing = this.verifications.get(user.userId);
    if (existing) return existing;
    const promise = this.revalidate(user)
      .catch(async error => {
        if (error instanceof AppError && error.statusCode === 429) {
          const details = (error.details as { retryAfterMs?: number; global?: boolean }) ?? {};
          const retryAt = await this.recordCooldown(
            user.userId,
            details.retryAfterMs,
            details.global,
          );
          throw new GuildAccessError('Discord rate limit reached; retry shortly', 429, {
            retryAfterMs: Math.max(0, new Date(retryAt).getTime() - this.now()),
            retryAt,
            global: details.global,
          });
        }
        if (error instanceof AppError && [502, 503].includes(error.statusCode))
          throw new GuildAccessError(
            'Discord permissions could not be verified; retry shortly',
            error.statusCode,
          );
        throw error;
      })
      .finally(() => {
        if (this.verifications.get(user.userId) === promise) this.verifications.delete(user.userId);
      });
    this.verifications.set(user.userId, promise);
    return promise;
  }
  private async revalidate(user: AuthPrincipal): Promise<void> {
    const initial = await this.prisma.authSession.findUnique({ where: { id: user.sessionId } });
    if (!initial || initial.userId !== user.userId || initial.expiresAt.getTime() <= this.now())
      throw new AuthError();
    const owner = randomUUID();
    const waitUntil = Date.now() + AuthPolicy.refreshWaitMs;
    while (true) {
      const current = await this.prisma.authSession.findUnique({ where: { id: user.sessionId } });
      if (!current || current.userId !== user.userId || current.expiresAt.getTime() <= this.now())
        throw new AuthError();
      if (current.refreshVersion > initial.refreshVersion) return;
      const acquired = await this.prisma.authSession.updateMany({
        where: {
          id: user.sessionId,
          refreshVersion: initial.refreshVersion,
          OR: [{ refreshOwner: null }, { refreshLeaseUntil: { lte: new Date(this.now()) } }],
        },
        data: {
          refreshOwner: owner,
          refreshLeaseUntil: new Date(this.now() + AuthPolicy.refreshLeaseMs),
        },
      });
      if (acquired.count) break;
      if (Date.now() >= waitUntil)
        throw new AppError('Session refresh is busy; retry shortly', 503);
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    try {
      let secret: string;
      const locked = await this.prisma.authSession.findUnique({ where: { id: user.sessionId } });
      if (!locked || locked.refreshOwner !== owner) throw new AuthError();
      try {
        secret = this.decrypt(locked.refreshToken);
      } catch {
        throw new AuthError('Session credential is no longer valid');
      }
      const revision = await this.access.revision();
      const tokens = await this.discord.refresh(secret);
      // Persist rotation before the guild request: an outage there must not lose the new credential.
      const rotated = await this.prisma.authSession.updateMany({
        where: { id: user.sessionId, refreshOwner: owner, expiresAt: { gt: new Date(this.now()) } },
        data: { refreshToken: this.encrypt(tokens.refresh_token) },
      });
      if (!rotated.count) throw new AuthError();
      const guilds = await this.discord.guilds(tokens.access_token);
      await this.prisma.$transaction(async tx => {
        const saved = await tx.authSession.updateMany({
          where: {
            id: user.sessionId,
            refreshOwner: owner,
            expiresAt: { gt: new Date(this.now()) },
          },
          data: { refreshedAt: new Date(this.now()), refreshVersion: { increment: 1 } },
        });
        if (!saved.count) throw new AuthError();
        await this.access.replaceMemberships(tx, user.userId, guilds, revision);
      });
    } catch (error) {
      if (error instanceof AuthError && error.statusCode === 401) await this.logout(user);
      throw error;
    } finally {
      await this.prisma.authSession.updateMany({
        where: { id: user.sessionId, refreshOwner: owner },
        data: { refreshOwner: null, refreshLeaseUntil: null },
      });
    }
  }
  async logout(user: AuthPrincipal) {
    await this.prisma.authSession.deleteMany({
      where: { id: user.sessionId, userId: user.userId },
    });
  }
}
