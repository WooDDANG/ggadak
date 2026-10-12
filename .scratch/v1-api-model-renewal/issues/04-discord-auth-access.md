# 04: Discord 로그인과 서버 접근 권한

**What to build:** Discord 로그인 후 접근 가능한 서버를 선택하고 해당 서버의 결정만 조회한다.

**Blocked by:** 02: v1 API 호환 기반 확장

**Status:** resolved

- [x] OAuth 코드 로그인, JWT 발급·검증과 프론트 로그인·서버 선택 흐름을 연결한다.
- [x] 사용자·길드·멤버십 관계를 저장하고 Prisma 모델, 데이터 마이그레이션 및 ERD를 반영한다.
- [x] 선택 서버 전달 방식을 API 계약에 명시하고 다른 서버의 결정 조회와 직접 ID 접근을 차단한다.
- [x] 기존 데이터의 서버 연결을 보존하고 유효·만료 토큰, 비회원 접근 및 서버 전환을 검증한다.


## Answer

Discord authorize/login/me/guilds/refresh/logout and persisted JWT sessions now connect to the FE login/server selector. v1 reads require explicit guildId and current membership, including direct IDs; FE query keys include the selected guild, generated clients share authorized transport, global legacy feedback is disabled. OAuth state is browser-bound and one-use, refresh credentials encrypted, membership authority bounded to 15 minutes. Legacy routes remain for ticket 13.

Prisma migration 202610120004 is additive and seeds existing guild IDs without granting memberships. No live DB migrated. See BE AUTH.md and docs/diagrams/v1-data-model.md. Reusable successor interfaces and public HTTP fixture are documented in AUTH.md and test-support/auth.ts.

Validation: BE build and 41 regression tests pass, including OAuth nonce reuse/missing cookie, bearer tampering/expiry, guild list/selection and direct-ID denial, refresh revocation, logout and server restart. Legacy-schema fixture retains ID, guild association and missing history through migrations. FE build and two public transport/client tests pass. External credentials and real Discord permissions are not exercised.

Official references: https://docs.discord.com/developers/topics/oauth2 and https://docs.discord.com/developers/resources/user (verified 2026-10-12).
