# 06: Decision의 이전 저장 형식과 중복 컬럼 제거

**What to build:** 이관된 Decision Record를 하나의 기준으로 조회·변경하면서, 필요 없어진 레거시 표현과 동기화 코드를 제거한다.

**Blocked by:** 05 — 레거시 Decision 이관과 조회 경로 전환.

**Status:** resolved

- [x] 대상 DB의 미이관·불일치 행이 없고 이전 읽기·쓰기 사용처가 없음을 확인하는 제거 전 조건을 제공한다.
- [x] participants·alternatives·tags 등 기준 도메인에 포함되며 별도 조회에도 쓰이지 않는 이전 컬럼과 fallback 변환을 제거한다. 실제 필터·정렬에 쓰는 파생 컬럼은 유지한다.
- [x] 상태·분류의 추가 중복은 모든 호출부가 새 계약을 사용한 경우에만 제거한다. 보존할 의미가 다른 필드를 이름만으로 합치지 않는다.
- [x] 제거 후 새 분석·편집·검수·교체·조회가 통과하고, 백업 DB에서의 전체 이관 절차를 검증한다.
- [x] 데이터 건수·식별자·검수 이력과 도메인 결과가 제거 전후 일치하며 운영용 백업/복구 절차가 있다.

## Answer

새 저장 형식 검증 후 legacy 중복 컬럼을 contract migration에서 제거했다. 보존된 archive와 명시적 backup/rollback 절차를 문서화했다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
