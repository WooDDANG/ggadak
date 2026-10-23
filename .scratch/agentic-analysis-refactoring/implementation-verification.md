# 구현 검증 — 2026-10-24

## 구현

- AnalysisRunner가 요청 claim부터 실행 슬롯·heartbeat·취소·실패 기록·최종 정리를 소유한다. 저장된 workflow 복원도 정리 범위에 포함했다. heartbeat 갱신은 직렬화하고 종료 시 진행 중인 갱신을 기다린다.
- AnalysisBusyError와 공통 분류 함수를 사용해 실행과 Analysis Queue의 재시도 판단을 통합했다. 기존 요청 오류의 status=503 호환 필드를 유지하며, provider의 오류 메시지가 용량 경합과 같아도 실제 provider 실패 횟수로 계산한다.
- 그래프의 후보 변환과 후보 게시 정책을 별도 모듈로 분리했다. CandidatePublicationRepository는 owner/lease fencing 후 후보·관계·그래프·결과를 같은 트랜잭션에서 저장한다.
- 관련 후보 탐색은 게시 중 채널당 identity 조회·파싱을 한 번 수행하고 메시지 ID 인덱스를 갱신한다. 새로 생성한 후보도 같은 게시 안에서 관계를 찾을 수 있다. 채널 전체 identity를 한 번 읽는 비용 자체는 남아 있다.
- AnalysisQueryService가 guild 범위 상태·그래프 조회를 담당하고 해당 Controller가 직접 사용한다. 기존 DiscussionService 조회 메서드는 호출자 호환을 위해 유지했다.

## 검증 결과

- 체크포인트가 불완전한 요청 뒤 다음 분석이 즉시 실행되는 회귀 테스트: 기존 코드에서 capacity busy로 실패하는 것을 확인한 뒤 수정 코드에서 통과했다.
- provider 오류 문구가 capacity busy와 같아도 retry attempt 1회와 provider-or-storage 분류를 유지하는 회귀 테스트 통과.
- BE 타입 검사 통과.
- 변경된 TypeScript 파일 Prettier 검사와 ESLint 통과, git diff 공백 검사 통과.
- 루트 npm test 통과: 전체 workspace 빌드, shared 15개, BE 135개, Bot 41개, FE 15개, E2E 8개, 총 214개 테스트.
- Standards와 Spec의 별도 리뷰 결과 각각 확인된 수정 필요 항목 0건. 리뷰는 구현 시작 시점의 작업 트리 대비 이번 변경만 대상으로 수행했다.

## 범위와 제한

운영 DB·실제 AGY 계정에는 접근하지 않았다. 실제 대형 채널의 지연 개선이나 실사용 처리량은 측정하지 않았다. 사용자의 커밋 승인 후 기존 DB·세션 병렬 처리 변경은 `feat/be-storage-parallel-sessions`에 먼저 커밋하고, 이번 변경은 이를 기반으로 한 `refactor/agentic-analysis-lifecycle` 브랜치에 별도 커밋한다. 겹치는 파일은 구현 시작 시점의 스냅샷과 대조해 두 변경을 분리했다.
