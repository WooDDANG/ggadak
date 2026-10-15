# Agentic 분석·논리 그래프 API

2026-10-14. 공통 인증·응답은 [FE 연동 문서](frontend-api.md)를 따른다. FE 화면 작업은 포함하지 않는다.

전체 기능 현황과 Mermaid 흐름도는 [의사결정 기능과 AI 분석 흐름](../decision-features.md)을 참고한다.

## 분석과 상태

기존 Bot `POST /api/discussions/analyze`는 서비스 인증으로 입력 대화를 전달한다. 추출 → 구조 검사 → AI 의미 검증 → 필요 시 한 번 수정 → 재검증 후 요청 전체를 공개한다. 응답은 기존 found/summary/decisions에 requestId/graphId/graphAvailable을 추가한다. found는 실제 반환 후보 존재이며 합의 존재가 아니다. 후보는 사람의 검수 전까지 Draft다.

`GET /api/v1/analysis-requests/{requestId}?guildId=...`는 Bearer JWT와 실제 요청의 서버 접근 권한으로 조회한다. data는 requestId/state/graphAvailable/retryable/error/sessions다.

- state: pending/processing/completed/terminal.
- phase: extract/check/verify/repair/recheck/reverify/done.
- sessions: sessionId/phase/repairs/elapsedMs/logicalCalls/attempts/inputTokens/outputTokens.
- error: null 또는 category/message/status/retryable. credential·stack·owner는 노출하지 않는다.

수정은 세션당 한 번, 논리 호출 최대 4회, 호출당 45초, 누적 활성 실행 180초다. 통신 재시도 대기는 제외하고 재시작으로 예산을 초기화하지 않는다. 통신 장애는 503으로 저장 단계에서 재개하며 최종 검증/예산 실패는 422로 보존한다. 같은 terminal 요청 재전송으로 AI를 다시 실행하지 않는다.

논리 호출 4회는 extract/verify/repair/reverify 기준이며 통신 재시도를 포함한 실제 CLI 시도 전체를 4회로 제한하지 않는다. 여러 세션과 재시도를 합친 요청 전체 누적 토큰·시간·실제 CLI 호출 예산은 아직 구현하지 않았다.

## 그래프 조회

`GET /api/v1/analysis-requests/{requestId}/graph?guildId=...`

data는 id/schemaVersion/requestId/guildId/sessions다. 세션은 sessionId/inputMessageIds/summary/nodes/edges/discussionProblems를 포함한다. 입력 원문 전체는 일반 graph 응답에 추가하지 않는다.

노드는 Topic/Issue/DecisionCandidate/Alternative/Rationale/ActionItem이며 문자열 id/type/summary를 가진다. 후보에는 observation(proposed/agreed/withdrawn/unclear), rationaleStatus(stated/not_stated), category, history가 있다. 대안은 독립적인 observation 또는 null이다. 없는 근거·담당자·기한·시각은 만들지 않는다. history.at은 ISO 시각 또는 null이며 메시지별 인용·출처는 필수가 아니다.

edge는 id/type/sourceId/targetId다. contains/has_alternative/supports/opposes/triggers/conflicts_with/depends_on을 지원한다. 충돌은 대칭 의미, 의존은 source가 target을 전제로 한다. 실제 모순·순환은 discussionProblems(summary/nodeIds/edgeIds)에 보존한다.

후보 노드의 decisionId/decisionVersion은 실제 카드와 분석 당시 버전이다. currentDecisionVersion/stale은 현재 상태에 대한 조회 메타데이터다. 사람이 수정해도 AI summary·관계를 덮어쓰지 않는다. 자동 분석에서 거절 후보를 억제하면 suppressed=true이고 새 카드를 만들지 않는다.

카드의 기존 history API에 requestId/graphAvailable/candidateNodeIds로 여러 분석을 연결한다. 같은 카드에 여러 graph가 있을 수 있다. 기존 카드 API는 유지한다.

| 상황                             | HTTP / code               |
| -------------------------------- | ------------------------- |
| 인증 없음                        | 401 / UNAUTHORIZED        |
| 다른 서버                        | 403 / FORBIDDEN           |
| 요청 없음 또는 legacy graph 없음 | 404 / NOT_FOUND           |
| 분석 미완료                      | 409 / CONFLICT            |
| terminal 분석                    | 422 / VALIDATION_ERROR    |
| 일시 장애                        | 503 / SERVICE_UNAVAILABLE |

## 근거 미언급·재분석

카드 rationale은 미언급 시 빈 문자열이고 rationaleStatus=not_stated다. 편집은 rationale 필드를 보내되 빈 값이 가능하며 대안 reason도 미언급 시 빈 값이다. title/decision/name은 비어 있을 수 없다. 사람의 근거 수정은 현재 카드 상태에만 반영하며 원본 AI graph는 보존한다.

delivery 조회의 requiresNewAnalysis=true 또는 errorCategory=analysis-terminal은 새 수동 분석이 필요한 실패다. 기존 retry는 동일 요청의 전달 재시도이며 terminal에서는 409로 거절한다. 새 재분석은 기존 Discord 수동 트리거/스캔 경로에서 새 ID로 생성한다.

Bot 시작·새 서버 초대는 과거 스캔을 자동 생성하지 않는다. 명시적 스캔/Sync Job만 과거 검사를 시작하며 보관 요청 복구와 새 대화 추적은 유지한다.
