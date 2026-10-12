# 01: Workspace 패키지 매니저 및 린터/포맷터 정비

**What to build:** 개발자가 npm 단일 도구로 일관되게 의존성을 관리하고, 자동 생성 코드로 인한 불필요한 포맷터 경고 없이 깔끔한 코드 스타일을 유지한다.

**Blocked by:** None

**Status:** resolved

- [x] 이미 존재하는 루트 `package-lock.json`과 npm workspaces를 단일 패키지 관리 경로로 유지하고 불필요한 `pnpm-workspace.yaml`을 제거한다.
- [x] Orval 및 TSOA 자동 생성 경로(`apps/fe/src/api/generated/`, `apps/be/src/api/routes/generated/` 등)를 `.prettierignore`와 ESLint flat config(`eslint.config.mjs`)의 ignore 설정에 등록한다. 별도 `.eslintignore`는 만들지 않는다.
- [x] 먼저 `npm run format:check`를 실행해 현재 실패 파일을 확인한다. 포맷이 필요한 파일만 정리하고, 생성 코드와 산출물은 변경하지 않으며 포맷 전용 커밋으로 검토할 수 있도록 한다.
- [x] 전체 `npm run format:check`와 `npm run lint`가 통과하는지 확인한다.

## Implementation

Generated TSOA/Orval paths are ignored by Prettier and ESLint. Formatting is isolated in commit d6f0f08. npm run format:check and npm run lint pass (lint retains 7 pre-existing Bot/shared warnings).
