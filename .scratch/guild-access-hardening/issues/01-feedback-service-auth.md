# 01: 기존 External Feedback API 인증 적용

**What to build:** External Feedback 조회·등록을 인증된 Bot 내부 호출로 제한한다. Bot의 `/피드백입력`은 계속 동작하며 미인증 요청과 사용자 JWT를 통한 전역 접근을 차단한다.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] 조회와 등록 모두 미인증·잘못된 서비스 토큰·사용자 JWT 요청을 거절한다.
- [ ] 서비스 토큰이 설정되지 않은 경우 접근을 허용하지 않는다.
- [ ] 올바른 Bot 서비스 토큰으로 등록하고 조회할 수 있고 Bot의 피드백 호출도 이 인증을 전송한다.
- [ ] HTTP 및 Bot 호출 회귀 테스트와 생성 API 계약, 인증 문서를 갱신한다.
- [ ] 서버별 웹 피드백 기능은 보류 상태를 유지한다.
