# 04: Decision 기준 저장 형식과 검색용 파생값 계약 확립

**What to build:** Decision의 완전한 도메인 원본과 조회용 컬럼의 역할을 명확히 하여, 새 결정과 검수 변경이 목록·상세·타임라인에서 일치하게 한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 버전을 구분하고 검증할 수 있는 기준 도메인 저장 형식을 추가한다. 기존 JSON/레거시 행을 읽는 경로는 이 단계에서 유지한다.
- [x] 상태·분류·주제·제목·확정 시각 등 검색에 필요한 컬럼을 도메인 원본에서 일관되게 파생한다. 상태와 lifecycle의 매핑을 한 경계에서 관리한다.
- [x] 분석 저장·수동 생성·편집·검수·교체의 모든 쓰기 경로가 같은 저장 변환을 사용한다.
- [x] 새 데이터와 기존 데이터가 섞여 있어도 목록·상세·필터·타임라인·Why 검색 대상 판정이 일치한다.
- [x] 원본과 조회용 파생값의 불일치를 탐지하는 검증을 제공하고, 다른 쓰기 경로에서 발생한 불일치를 실제로 잡는 테스트를 둔다.

## Answer

Decision.domainJson과 storageVersion을 기준으로 삼고 검색용 projection은 decisionData에서 함께 기록한다. db:audit로 payload 유효성과 projection 불일치를 확인한다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
