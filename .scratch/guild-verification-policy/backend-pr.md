## Summary

Discord API 요청 제한(429)에 대한 서버 권한 재확인 정책(ADR-0026)을 백엔드에 구현하고, FE 서브모듈 변경 커밋(`5eb276e`)을 연결합니다.

```text
selectableGuilds(user) / checkGuildAccess(user, guildId)
  ├─ activeCooldown(user.userId) ➔ 활성 쿨다운 존재 시 외부 Discord 호출 없이 즉시 rate_limited 응답
  ├─ snapshotTrusted(user.userId) ➔ 봇 미설치 서버로 인한 불필요한 전체 재검증 차단
  ├─ revalidate(user)
  │    ├─ refresh_token 회전 선저장 (장애·429 시에도 갱신된 자격증명 보존)
  │    └─ Discord 429 수신 시 StorageArchive에 retryUntil 영속화 (서버 재시작 후에도 보존)
  └─ InstalledGuildsService.select() ➔ 봇 설치 서버 필터링
```

- **429 쿨다운 영속화:** `StorageArchive` 테이블에 `user:${userId}` 및 `global` 스코프로 종료 시각을 저장하여 BE 재시작 후에도 대기를 보존하고 다중 세션에 공유합니다.
- **다중 사용자 격리:** 한 사용자의 요청 제한이 다른 정상 사용자에게 전파되지 않도록 격리했습니다.
- **자격증명 회전 보존:** 토큰 갱신 시 `refreshToken` 암호화 저장을 Discord 길드 조회보다 먼저 수행하여, 길드 조회 실패 후에도 갱신된 자격증명으로 복구할 수 있도록 했습니다.
- **DTO 확장:** `GuildVerificationDto` (`status`, `retryAt`, `eventCoverage`) 필드를 추가하여 클라이언트가 대기 상태와 게이트웨이 커버리지 이상을 식별할 수 있게 했습니다.

## Evidence

- `apps/be/tests/guild-access.test.ts`:
  - `rate limited verification persists across restart, shares cooldown, and isolates other users` 통과
  - `rate limited revalidation preserves rotated refresh token and restores on manual retry after expiry` 통과
  - `selection trusts installed guild coverage without refreshing noninstalled memberships` 통과
  - 11/11 통과
- 백엔드 전체 테스트 통과: 50개 파일 187개 테스트 (`npm test --workspace=@ggaddak/be`)
- 모노레포 전체 E2E 테스트 통과: 7개 파일 14개 테스트 (`npm run test:e2e`)
- 타입 체크 및 빌드 통과 (`npm run typecheck`, `npm run build`)

## Merge Danger

**Door:** two-way

기존 스키마 변경 없이 `StorageArchive` 키-값 레코드를 활용하며, 하위 호환성을 유지하는 DTO 필드 확장으로 롤백이 용이합니다.

**Blast Radius:** authorization

인증 및 서버 권한 인가 경로(`selectableGuilds`, `checkGuildAccess`, `verifyGuilds`)에 적용되며, 사용자별 스코프로 격리되어 있습니다.
