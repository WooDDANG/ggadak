# 03: External Feedback의 채널 중심 저장 계약 정리

**What to build:** 채널 또는 전역에 대한 External Feedback을 의미에 맞는 필드로 저장하고 조회한다. 채널 ID를 결정 ID로, 공급자를 작성자로 저장하는 이전 표현을 정리한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 기존 피드백 API의 채널 범위·전역 범위·출처·내용·상세 정보·생성 시각을 유지하는 기준 저장 표현을 정한다.
- [x] 새 저장 경로는 채널 ID를 decisionId에 복제하거나 source를 author에 복제하지 않는다. 제공되지 않은 작성자나 결정 관계를 추정하지 않는다.
- [x] 기존 JSON 저장 행과 레거시 컬럼 행을 모두 이관한다. 의미 있는 과거 정보는 보존하고, 이전 읽기 의존성이 없어졌을 때 중복 필드를 제거한다.
- [x] 채널/전역 필터와 최신순 제한을 저장소 조회에서 처리하며 기존 API 결과와 순서를 보존한다.
- [x] 피드백 생성·재조회·재시작과 레거시 이관을 격리 DB에서 검증한다. 현재 로컬 테이블이 비어 있다는 사실에 의존하지 않는다.

## Answer

ExternalFeedback을 channelId/source/content/detail 중심으로 저장한다. 기존 author 등 제거 필드는 archive로 보존하며 채널 필터/정렬/제한은 DB에서 실행한다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
