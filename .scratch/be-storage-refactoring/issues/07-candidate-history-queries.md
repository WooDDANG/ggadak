# 07: 후보 이력 관계 조회와 그래프 버전 조회 개선

**What to build:** 후보 이력과 그래프를 조회할 때 전체 이력을 반복 검색하거나 후보마다 DB 요청을 보내지 않고도 기존과 같은 관련 후보·분석 이력·버전 상태를 제공한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 관련 후보의 정방향·역방향 탐색을 인덱스로 조회할 수 있는 관계 표현을 추가하고, 기존 JSON 관계를 중복 없이 이관한다.
- [x] 후보 이력 API가 과거 요청 목록·관련 후보·노드 연결을 보존한다. 응답 행마다 전체 CandidateAnalysis를 재조회하지 않는다.
- [x] 그래프의 연결된 결정 ID를 모아 한 번에 현재 버전을 조회하고 stale 판정을 유지한다.
- [x] 기존 JSON 관계 의존성은 대조 검증 후 제거한다. 과거 요청 목록이 분석 당시 snapshot인지 동적 조회인지 구분해 기존 의미를 보존한다.
- [x] 많은 이력과 후보를 가진 fixture에서 결과 동등성과 DB 요청 수를 검증한다. 추가 인덱스는 실제 조회 조건과 실행 계획에 근거한다.

## Answer

CandidateRelation의 정방향/역방향 index와 batch version lookup으로 반복 전체 조회와 graph N+1을 제거했다. 분석 당시 previousRequests snapshot은 별도 보존한다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
