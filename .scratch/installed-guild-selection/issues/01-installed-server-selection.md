# 01: 봇이 설치된 가입 서버만 표시

**What to build:** 로그인·세션 복원·서버 조회가 설치 확인된 가입 서버만 반환하고, FE의 모든 서버 선택 화면이 같은 목록을 사용한다.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [x] 가입 여부와 GGADDAK 봇 설치 여부의 네 조합 중 두 조건을 모두 만족하는 서버만 표시한다.
- [x] 로그인·세션 복원·명시적 서버 조회에 같은 정책을 적용한다.
- [x] 일반 멤버, 카드 0개, 모니터링 채널 0개 서버도 설치·가입 조건을 충족하면 표시한다.
- [x] 정상 빈 목록과 설치 정보 확인 불가를 API와 화면에서 구분한다.
- [x] FE→HTTP 응답과 실제 브라우저 선택 흐름을 검증하고 API 설명을 갱신한다.


## Comments

- Execution: done. BE c3882a2, FE e45aa8b (PR #3 대기). 부모 작업 브랜치 feat/installed-guild-selection.
- 검증: BE 전체 회귀 183개 및 최종 설치 목록 회귀 8개, Bot 53개, E2E 9개, Chrome 브라우저 회귀 1개, FE 빌드·루트 타입 검사 통과.
- 브라우저 회귀는 실제 React/Axios와 제어된 HTTP fixture를 사용하며 쿠키 복원·빈 목록/장애·선택 유지·포커스 복귀·서버/계정 경합·JWT 복구를 확인했다. 실제 Discord 제거·설치는 이벤트 fixture로 제어했다.
