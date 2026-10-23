# 01: DB 스키마 불일치 사전 점검과 마이그레이션 검증

**What to build:** 운영자가 BE를 실행하기 전에 선택된 SQLite DB와 적용되지 않은 마이그레이션을 확인하고, 기존 데이터를 보존하며 Analysis Queue 사용 준비를 검증할 수 있게 한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 표준 npm 명령으로 대상 DB 경로, 마이그레이션 상태와 누락된 필수 테이블을 확인한다. 비밀 환경변수 값은 출력하지 않는다.
- [x] 누락된 큐 스키마를 식별하고 필요한 조치를 설명한다. 백업·대상 확인 없이 서비스 시작 과정에서 DB 구조를 자동 변경하지 않는다.
- [x] 적용 전 백업과 복구 절차를 제공하고, 기존 DB 복사본에 최신 마이그레이션을 적용해 결정·검수·분석 기록의 보존을 확인한다.
- [x] 마이그레이션 후 수신·상태 조회·오프라인 fixture 분석이 실제 저장 경계를 통해 동작한다. 반복 실행으로 데이터나 작업이 중복되지 않는다.
- [x] 누락된 스키마에서는 실패하고 적용된 스키마에서는 통과하는 격리 DB 검증이 있다.

## Answer

시작 시 generated schema와 실제 테이블/컬럼을 검사한다. db:check/backup/upgrade는 선택 DB를 명시하며 upgrade는 백업 후 additive prerequisite → backfill/검증 → data/contract 순서로 진행한다. legacy-only fixture와 실제 DB 복사본으로 검증했다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
