# 01: NVIDIA 키 4개를 AI Call에 순환 사용

**What to build:** Extract·Verify·Repair에서 번호가 붙은 네 키를 사용하고 기존 단일 키도 지원한다.

**Blocked by:** 없음

**Status:** ready-for-agent

- [x] 빈 값·중복 키와 키 미설정을 처리한다.
- [x] 네 키가 모두 선택되고 단일 키도 동작함을 검증한다.
- [x] 비밀값을 노출하지 않는다.

## Comments

Codex가 직접 구현했다. Provider 호출 테스트에서 네 키가 모두 선택되고 SDK 재시도가 꺼져 있음을 확인했다. 계정 키 원문은 메모리에만 유지하고 Provider 오류 진단은 키를 제거한 후 기존 크기 제한과 비밀값 제거 규칙을 적용한다.
