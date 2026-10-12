# 08: Vitest 기반 테스트 환경 통합 및 디렉터리 분리

**What to build:** 소스 코드(`src/`) 사이에 섞여 있던 테스트 파일들을 전용 `tests/` 디렉터리로 분리하고, 모노레포와 ESM에 최적화된 Vitest 러너를 구축하여 일괄 실행을 지원한다.

**Blocked by:** 07: Controller 계층 인가 가드 및 DTO 변환 표준화

**Status:** ready-for-agent

- [ ] Vitest 및 관련 모듈(`vitest`, `@vitest/coverage-v8`)을 설치하고 모노레포 루트/패키지 설정(`vitest.config.ts`)을 구성한다.
- [ ] `apps/be/src/*.test.ts` 파일들을 `apps/be/tests/` 디렉터리로 이전한다.
- [ ] 루트 `test/e2e.test.ts`를 `tests/e2e/`로 이전하고 `package.json`의 `test` 스크립트를 vitest 기반으로 갱신한다.
- [ ] Node.js `assert` 단언문을 점진적으로 Vitest `expect` 문법으로 정리하고 모든 테스트가 통과하는지 확인한다.
