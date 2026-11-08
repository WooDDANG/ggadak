## Summary

Discord API 요청 제한(429) 시 로그인 세션과 편집 초안을 보존하고, 실시간 카운트다운 및 수동 재시도를 제공하는 화면 게이트 컴포넌트를 추가합니다.

```diff
 <Root>
   if (auth.isChecking) <LoadingState />
   else if (!auth.isAuthenticated) <Landing />
+  else if (auth.guildVerification?.status === 'rate_limited') <GuildRateLimitedGate auth={auth} />
   else if (auth.guildSelection.status === 'unavailable') <GuildUnavailableGate />
   <Workspace />
```

- **요청 차단 및 복구 분리:** 쿨다운 중 focus/online 자동 재요청을 차단하고, 쿨다운 만료 후 사용자의 수동 "다시 시도" 버튼 클릭으로만 조회를 재개합니다.
- **초안 및 세션 보존:** 서버 권한 확인 대기 중에도 로그인 계정명과 상태를 화면에 유지하며, 편집 중이던 카드의 초안을 유실하지 않습니다.
- **카운트다운 UI:** `GuildRateLimitedGate`에 `[data-retry-countdown]` 요소를 제공하여 남은 대기 시간(초)을 실시간으로 안내합니다.

## Evidence

- `apps/frontend-main/tests/guild-verification.browser.test.mjs`:
  - `restored account stays visible during verification cooldown and only manual retry resumes requests` 통과 (1/1)
- 프론트엔드 전체 회귀 테스트 통과: 18/18 (`npm run test --workspace=apps/frontend-main`)

## Merge Danger

**Door:** two-way

상태 필드 추가(`guildVerification`) 및 전용 게이트 분기 추가로, 롤백이 용이합니다.

**Blast Radius:** rendering

서버 권한 대기 시 표시되는 게이트 화면 및 쿨다운 중의 백그라운드 갱신 차단에 한정됩니다.
