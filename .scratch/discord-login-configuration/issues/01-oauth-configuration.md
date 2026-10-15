# 01: Discord 로그인 설정 오류 안내

**What to build:** FE의 Discord 로그인 버튼이 실패할 때 웹 OAuth 설정 누락·유효성 오류를 사용자가 식별할 수 있도록 한다. 자격증명 값과 일반적인 서버 내부 오류는 응답에 노출하지 않는다.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] 실제 FE·BE의 authorize 호출에서 503 / Internal Server Error를 재현한다.
- [x] 누락된 설정 이름과 루트 .env·BE 재시작 안내를 응답으로 반환한다.
- [x] 일반 5xx 오류는 숨기고, 유효하지 않은 OAuth 값은 응답에 포함하지 않는다.
- [x] 로컬 기본 콜백 예시를 FE 기본 포트 3000에 맞춘다.
- [x] 회귀·정상 로그인 테스트, 전체 테스트, 타입 검사, lint를 통과한다.

## 진단

2026-10-15, localhost:3000과 :3001의 GET /api/v1/auth/authorize 모두 503이며 로그인 URL이 없었다. 루트 .env에 DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_REDIRECT_URI, AUTH_SECRET이 모두 없었다. validateAuthConfig가 발생시킨 의도된 설정 오류를 공통 v1 오류 처리기가 일반 5xx 메시지로 가리고 있었다.

재현·회귀 명령: `npm run test --workspace=@ggaddak/be -- tests/auth-configuration.test.ts`. 수정 전 `expected 'Internal Server Error' to contain 'Discord login is not configured'`로 실패했고, 수정 후 통과했다. 실제 FE 경유 요청에서도 같은 설정 안내가 반환되는 것을 확인했다.

실제 Discord 사용자 인증 완료는 미검증이다. 외부에서 발급한 OAuth 자격증명과 정확히 등록한 FE redirect URI가 필요하다. 이번 작업은 인증 우회나 fake 운영 로그인을 추가하지 않는다. 실제 DB·.env·Bot 토큰은 변경하지 않았다.
