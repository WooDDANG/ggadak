# 04: Base Repository 구축 및 Prisma 공통 인프라 모듈화

**What to build:** Repository에 주입되는 Prisma 접근, 명시적 트랜잭션 컨텍스트 전달, 공통 Prisma 오류 분류를 재사용하는 `BaseRepository` 기반을 만든다. Prisma 연결 및 종료 수명주기는 기존 BE loader가 관리한다.

**Blocked by:** 03: 의사결정 API 입출력 Request/Response DTO 정규화

**Status:** resolved

- [x] `apps/be/src/repositories/base.repository.ts`를 작성하고 PrismaClient 주입을 공통화한다. `$connect`/`$disconnect`는 BaseRepository로 옮기지 않고 `loaders/prisma.ts`의 단일 인스턴스 수명주기를 유지한다.
- [x] Repository 작업이 `Prisma.TransactionClient`를 받을 수 있게 하고, `withTransaction(tx => ...)`가 동일한 `tx`를 콜백과 하위 Repository 작업에 전달하도록 한다. 이미 전달된 트랜잭션 안에서 중첩 `$transaction`을 열지 않는다.
- [x] P2002는 공통 Conflict 분류를 제공한다. P2025는 기본적으로 무조건 404로 바꾸지 말고, 호출이 “대상이 반드시 존재해야 함”을 보장하는 경우에만 `NotFoundError`로 매핑한다. 조건부 버전 갱신 실패는 기존 409 의미를 유지한다.
- [x] 트랜잭션 성공·롤백, 전달된 트랜잭션 컨텍스트 재사용, P2002/P2025의 호출 의미별 매핑을 테스트한다. 기존 Repository 동작의 오류 응답과 원자성 회귀를 확인한다.

## Implementation

BaseRepository reuses explicit transaction contexts and centralizes Prisma error classification. Real SQLite tests cover commit, rollback, context reuse, unique conflicts, and opt-in not-found mapping. Loader still owns the connection lifecycle.
