# 03: NVIDIA 403을 영구 비활성화에서 cooldown으로 분리

**What to build:** 모델 권한 부족 같은 403 한 번이 키를 영구히 끄지 않게 한다. 401은 지금처럼 영구 비활성화한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `apps/be/src/adapters/nvidia-key-pool.ts:148-150`에서 403은 `disabled = 1` 대신 1시간 cooldown을 기록한다.
- [ ] `docs/operations/nvidia-key-pool.md:22`의 운영 설명을 고친다.
- [ ] 키를 되살리는 운영 명령은 만들지 않는다.
- [ ] 403 뒤 cooldown이 끝나면 키가 다시 선택되는지, 401 뒤에는 선택되지 않는지 테스트한다.
- [ ] 남은 키가 모두 403으로 쉬면 대기(503)가 아니라 인증 장애(403, `auth`)로 알리고, 429로 쉬는 키가 하나라도 있으면 대기로 알리는지 테스트한다.

## Comments

**2026-11-19 구현:** 테스트를 먼저 쓰고 빨강에서 초록으로 확인했으며, BE 테스트 248건, Bot 테스트 55건과 타입 검사가 통과했다. 구현 후 내린 결정은 `../spec.md`의 '결정 기록'에 있다.
