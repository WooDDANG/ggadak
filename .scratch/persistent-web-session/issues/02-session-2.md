# 02: 7일 브라우저 세션 복원

**What to build:** 로그인 쿠키와 서버 세션으로 새로고침·브라우저 재시작·access JWT 만료 후에도 권한을 확인해 복원하며, 고정 7일 만료·로그아웃·일시 장애·동시 복원을 검증한다.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] 로그인 쿠키와 서버 세션으로 새로고침·브라우저 재시작·access JWT 만료 후에도 권한을 확인해 복원하며, 고정 7일 만료·로그아웃·일시 장애·동시 복원을 검증한다.
- [x] 합의된 7일 고정 만료·권한 확인·일시 장애 경계를 보존한다.
- [x] 관련 회귀 테스트·타입 검사·최종 전체 테스트와 코드 리뷰를 통과한다.

## Comments

실제 HTTP 경계에서 신규 cookie·재시작 후 복원·JWT 만료 복구·절대 7일 만료·Origin/위조 거절·로그아웃 재사용 거절·동시 refresh·일시 장애 중 credential 회전 보존을 검증했다. FE API 테스트와 격리 Chrome의 실제 AuthGate에서 StrictMode callback·장애 차단/재연결·선택 서버·탭 전파를 확인했다. BE115/FE14/Bot36/Shared15/E2E7 및 타입 검사·lint 통과. 실제 사용자 OAuth는 01번의 외부 설정 확인과 구분한다. 최종 코드 리뷰 결과는 후속 기록한다.
