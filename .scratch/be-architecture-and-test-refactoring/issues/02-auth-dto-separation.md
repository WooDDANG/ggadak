# 02: 인증/세션 전용 DTO 및 에러 분리

**What to build:** `AuthService` 상단에 혼재되어 있던 인증 타입 및 에러를 전용 DTO 파일로 분리하여 미들웨어, 컨트롤러, 서비스 간의 순환 참조를 차단하고 가벼운 인터페이스를 제공한다.

**Blocked by:** 01: Workspace 패키지 매니저 및 린터/포맷터 정비

**Status:** ready-for-agent

- [ ] `apps/be/src/dto/auth.dto.ts`를 신규 생성하고 `AuthUserDto`, `AuthPrincipalDto`, `AuthConfigDto`, `AuthOptionsDto`를 정의한다.
- [ ] `AuthError` 클래스를 전용 파일(`apps/be/src/errors/AuthError.ts`)로 분리하거나 `AppError.ts`로 정돈한다.
- [ ] TSOA 인증 핸들러(`apps/be/src/api/authentication.ts`), 컨트롤러, 테스트 코드에서 무거운 `AuthService` 대신 신규 DTO/에러를 import하도록 전환한다.
- [ ] `npm run build` 및 기존 인증 관련 테스트(`apps/be/src/auth.test.ts`)가 통과하는지 확인한다.
