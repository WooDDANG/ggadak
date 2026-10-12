# 04: Base Repository 구축 및 Prisma 공통 인프라 모듈화

**What to build:** 공통 PrismaClient 주입, 트랜잭션 래퍼, Prisma 에러 매핑을 담은 `BaseRepository`를 구축하여 저장소 계층의 중복 보일러플레이트를 제거한다.

**Blocked by:** 03: 의사결정 API 입출력 Request/Response DTO 정규화

**Status:** ready-for-agent

- [ ] `apps/be/src/repositories/base.repository.ts`를 신규 작성한다.
- [ ] `Prisma.TransactionClient` 컨텍스트 및 `withTransaction(tx => ...)` 공통 헬퍼를 구현한다.
- [ ] Prisma 고유 키 충돌(P2002), 레코드 미존재(P2025) 등의 예외를 도메인 예외(`ConflictError`, `NotFoundError`)로 매핑하는 유틸을 제공한다.
- [ ] 신규 작성된 BaseRepository의 트랜잭션 및 에러 변환 단위 테스트를 작성하고 검증한다.
