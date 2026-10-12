# 01: Workspace 패키지 매니저 및 린터/포맷터 정비

**What to build:** 개발자가 npm 단일 도구로 일관되게 의존성을 관리하고, 자동 생성 코드로 인한 불필요한 포맷터 경고 없이 깔끔한 코드 스타일을 유지한다.

**Blocked by:** None

**Status:** ready-for-agent

- [ ] 루트의 `pnpm-workspace.yaml`을 삭제하고 `package-lock.json` 기반의 npm 워크스페이스 체계를 정착시킨다.
- [ ] Orval 및 TSOA 자동 생성 경로(`apps/fe/src/api/generated/`, `apps/be/src/api/routes/generated/` 등)를 `.prettierignore` 및 `.eslintignore`에 등록한다.
- [ ] `npm run format`을 실행하여 프로젝트 전체 코드 스타일을 일괄 정리하고 `npm run format:check`가 성공하도록 만든다.
- [ ] `npm run lint` 검사가 정상 통과하는지 확인한다.
