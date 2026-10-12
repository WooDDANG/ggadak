# 07: Controller 계층 인가 가드 및 DTO 변환 표준화

**What to build:** 컨트롤러 내부에서 중복 호출되던 길드 인가 로직을 정리하고, Service 결과 데이터를 Response DTO로 일관되게 매핑하는 구조를 정착시킨다.

**Blocked by:** 06: 의사결정 비즈니스 유효성 검증 로직 Service 이관

**Status:** ready-for-agent

- [ ] 컨트롤러마다 반복되던 `this.auth.requireDecision` 호출 패턴을 점검하고 표준 인가 헬퍼/미들웨어 형태로 정리한다.
- [ ] Controller 메서드 내부의 인라인 타입 캐스팅(`(request.user as AuthPrincipal)`)을 전용 AuthPrincipal DTO 인터페이스로 깔끔하게 정리한다.
- [ ] TSOA 라우트 재생성(`npm run swagger`) 및 OpenAPI 스펙이 정상적으로 최신화되는지 확인한다.
- [ ] 전체 HTTP 엔드포인트 검증 테스트(`server.test.ts`, `channels.test.ts`, `auth.test.ts`)가 통과하는지 확인한다.
