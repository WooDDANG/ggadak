# 02: 인증/세션 전용 DTO 및 에러 분리

**What to build:** 인증 응답 DTO와 Principal 타입을 API DTO 계층으로 분리하고, 인증 환경설정은 `.env`를 읽는 `apps/be/src/config/index.ts`에서 타입 안전하게 구성한다. 인증 서비스의 실행 옵션과 외부 어댑터 타입은 서비스/어댑터 계층에 둬서 설정·API 계약·의존성 주입 타입을 혼동하지 않는다.

**Blocked by:** 01: Workspace 패키지 매니저 및 린터/포맷터 정비

**Status:** resolved

- [x] `apps/be/src/dto/auth.dto.ts`에는 외부 응답인 `AuthUserDto`와 인증 결과인 `AuthPrincipal`처럼 API/인가 경계에 필요한 타입만 정의한다. `AuthConfig`는 `config/index.ts`에서 환경변수로부터 파싱·검증하고, `AuthOptions` 및 어댑터 주입 타입은 서비스/어댑터 계층에 둔다. 환경변수의 비밀 값은 DTO에 포함하지 않는다.
- [x] `AuthError` 클래스를 전용 파일(`apps/be/src/errors/AuthError.ts`)로 분리하거나 `AppError.ts`로 정돈한다.
- [x] TSOA 인증 핸들러(`apps/be/src/api/authentication.ts`), 컨트롤러, 테스트 코드가 `AuthService`의 런타임 구현을 타입 참조 목적으로 불러오지 않도록 신규 DTO/에러와 가벼운 타입 import로 전환한다.
- [x] `npm run build` 및 기존 인증 관련 테스트(`apps/be/src/auth.test.ts`)가 통과하는지 확인한다.

## Implementation

AuthUserDto/AuthPrincipal and AuthError now have dedicated modules. Auth configuration is parsed in config/index.ts and validated when login is used, preserving service-only startup. Build and HTTP auth regression tests pass.
