# 08: Vitest 기반 테스트 환경 통합 및 디렉터리 분리

**What to build:** BE 단위/통합 테스트를 `apps/be/tests/` 한곳에 모으고 Vitest로 실행한다. E2E 테스트는 BE 테스트와 분리해 저장소 루트 `tests/e2e/`에 둔다.

**Blocked by:** 07: Controller 계층 인가 가드 및 DTO 변환 표준화

**Status:** resolved

- [x] BE workspace에 Vitest 및 필요한 모듈을 추가하고 BE 테스트만 대상으로 하는 Vitest 설정을 구성한다.
- [x] `apps/be/src/` 아래에 흩어진 모든 BE `*.test.ts` 파일을 `apps/be/tests/` 아래로 이전한다. 테스트의 계층별 디렉터리 구조는 유지한다.
- [x] 루트 `test/e2e.test.ts`를 `tests/e2e/`로 이전하고, 루트 E2E 설정/스크립트에서 Vitest를 사용한다.
- [x] BE 및 E2E 테스트의 Node.js `assert` 단언문을 Vitest `expect`로 정리하고 두 테스트 명령이 통과하는지 확인한다.
- [x] 이 티켓에서는 Bot, FE, shared 패키지의 테스트 파일 위치나 러너를 변경하지 않는다.

## Implementation

All 19 existing BE test files moved into apps/be/tests; BaseRepository and DecisionService regression files added. E2E moved into tests/e2e. Both suites use Vitest expect and preserve decorator metadata. npm test passes across all workspaces and E2E; Bot/FE/shared runners and test locations are unchanged.
