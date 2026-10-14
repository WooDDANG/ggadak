# BE Agentic 의사결정 분석과 논리 그래프

Status: ready-for-agent
Created: 2026-10-14
Test seam confirmation: confirmed by user on 2026-10-14

## Problem Statement

팀원은 Discord 대화에서 제안·합의·검토한 대안·근거·후속 과제를 찾아 사람이 검수할 수 있는 후보로 받고 싶다. 현재 세션당 단일 AI 호출은 합의되지 않은 제안을 놓치거나, 없는 근거를 채우거나, 실제 합의와 AI의 요약을 혼동할 수 있다. 관련 내용의 논리 관계와 제안부터 철회까지의 흐름도 체계적으로 제공하지 않는다.

분석이 여러 AI 단계로 늘어나면 통신 실패나 서버 재시작마다 이미 끝난 호출을 반복하고 수정·시간 예산이 초기화될 수 있다. 일부 결과만 검수 큐에 나타나거나 과거 AI 결과가 사람이 수정한 최신 내용처럼 표시되면 검수자가 결과를 신뢰하기 어렵다.

## Solution

입력 대화 안에서 검수할 Decision Candidate와 논리 그래프를 함께 추출한다. BE가 고정된 단계로 구조 검사·AI 의미 검증·필요한 한 번의 수정·재검증을 수행하고, 검증된 요청 전체 결과만 공개한다. AI는 제안과 대화 속 합의를 분석하지만 정식 확정·Supersede는 사람이 수행한다.

완료한 단계는 DB에 보존해 같은 요청의 재시도에서 재사용한다. 후보·그래프·요청 완료는 함께 반영하고 AI 그래프 snapshot은 사람의 편집·검수 버전과 구분한다. AMI 기반 평가와 추가 정답을 작성한 서비스 평가를 분리해 품질·비용·지연을 확인한다.

## User Stories

1. As a 팀원, I want 합의되지 않은 실행 제안도 후보로 받기, so that 검토할 선택을 놓치지 않는다.
2. As a 검수자, I want 대화에서 합의가 관측됐는지 별도로 보기, so that 사람의 확정 상태와 혼동하지 않는다.
3. As a 검수자, I want 철회된 제안도 이력과 함께 받기, so that 논의 흐름을 이해한다.
4. As a 팀원, I want 같은 선택의 경쟁 대안을 후보 하나에서 보기, so that 선택지를 비교한다.
5. As a 팀원, I want 독립적으로 실행할 결정은 별도 후보로 받기, so that 각각 검수한다.
6. As a 검수자, I want 한 대안 채택을 다른 대안 거절로 자동 해석하지 않기, so that 대화에 없는 결론을 피한다.
7. As a 검수자, I want 메시지별 인용이 없는 AI 요약도 읽기, so that 논의를 간결하게 파악한다.
8. As a 검수자, I want AI 요약을 실제 발언의 직접 인용과 구별하기, so that 만들어진 문장을 발언으로 오인하지 않는다.
9. As a 검수자, I want 근거가 언급되지 않았음을 보기, so that 없는 이유를 사실로 믿지 않는다.
10. As a 팀원, I want 문제 보고·질문만 있는 대화도 맥락 그래프로 남기기, so that 미해결 문제를 잃지 않는다.
11. As a 검수자, I want Topic과 Issue를 구별하기, so that 같은 주제 안의 다른 문제를 이해한다.
12. As a 검수자, I want 후보·대안·근거·후속 과제의 연결을 조회하기, so that 선택의 구조를 파악한다.
13. As a 검수자, I want 찬성·반대 근거를 구별하기, so that 대안별 판단을 이해한다.
14. As a 검수자, I want 입력에 실제 있는 충돌·의존 관계를 보기, so that 상충하는 제안을 확인한다.
15. As a 검수자, I want 실제 대화의 순환 의존도 문제 표시와 함께 보존하기, so that AI가 임의로 해소하지 않는다.
16. As a 팀원, I want 언급되지 않은 담당자·기한·시각은 비워두기, so that 가짜 책임과 일정이 생기지 않는다.
17. As a 검수자, I want 모든 결과가 의미 검증을 거치기, so that 누락과 왜곡을 줄인다.
18. As a 팀원, I want 후보 없음도 검증하기, so that 놓친 제안을 정상 완료로 숨기지 않는다.
19. As a 운영자, I want 검증 오류가 있을 때만 제한된 수정을 수행하기, so that 호출 비용을 통제한다.
20. As a 운영자, I want 수정 실패를 실패로 보존하기, so that 잘못된 일부 결과를 공개하지 않는다.
21. As a 운영자, I want 호출·세션 시간 제한을 적용하기, so that 분석이 끝없이 실행되지 않는다.
22. As a 운영자, I want 구조 오류와 실제 대화 모순을 구별하기, so that 올바른 모순 분석을 실패로 처리하지 않는다.
23. As a 운영자, I want 완료한 단계를 재시작 뒤 재사용하기, so that 불필요한 AI 호출을 줄인다.
24. As a 운영자, I want 통신 재시도와 내용 수정을 구별하기, so that 예산과 오류 원인이 명확하다.
25. As a 운영자, I want 재시도로 수정·누적 시간 예산이 초기화되지 않기, so that 제한을 유지한다.
26. As a 운영자, I want 동일 요청의 다른 입력을 거절하기, so that 요청 멱등성이 보장된다.
27. As a 팀원, I want 의도적인 재분석은 새 요청으로 연결하기, so that 과거 결과가 보존된다.
28. As a 운영자, I want 소유권을 잃은 실행이 저장하지 못하기, so that 중복·늦은 결과를 막는다.
29. As a 팀원, I want 모든 세션이 성공한 뒤 결과를 받기, so that 부분 결과를 완성된 분석으로 오해하지 않는다.
30. As a 운영자, I want 후보·그래프·완료 결과가 원자적으로 저장되기, so that 중간 실패가 불일치를 만들지 않는다.
31. As a 팀원, I want 완료 요청 재전송이 같은 결과를 반환하기, so that 중복 카드가 생기지 않는다.
32. As a 검수자, I want 그래프의 후보에서 실제 카드로 연결하기, so that 검수를 이어간다.
33. As a 검수자, I want 카드의 여러 분석 이력을 찾기, so that 재분석 결과를 비교한다.
34. As a 검수자, I want AI 분석 당시 내용과 현재 카드 버전을 구별하기, so that 오래된 그래프를 최신 내용으로 오인하지 않는다.
35. As a 팀원, I want 기존 검수·교체 규칙을 유지하기, so that AI가 확정 기록을 변경하지 않는다.
36. As a 서버 구성원, I want 내 서버의 분석만 조회하기, so that 다른 서버의 대화가 노출되지 않는다.
37. As a 운영자, I want 실패 분류·단계·소비 예산을 조회하기, so that 재시도 또는 새 재분석을 판단한다.
38. As a 개발자, I want 실제 API·DB 경계에서 고정 AI 응답으로 검증하기, so that 외부 호출 없이 회귀를 확인한다.
39. As a 개발자, I want 공급자별 구조화 출력과 오류 처리를 검증하기, so that 모델 연결 차이가 분석 계약을 깨지 않는다.
40. As a 평가자, I want AMI 대화만 모델에 입력하기, so that 정답 누출 없이 비교한다.
41. As a 평가자, I want 기존 단일 호출과 새 workflow를 같은 설정으로 비교하기, so that 변경 효과를 측정한다.
42. As a 평가자, I want AMI 기반 결과와 서비스 후보·그래프 결과를 분리하기, so that 불완전한 정답으로 성능을 과장하지 않는다.
43. As a 평가자, I want 추가 정답을 사람이 확인하기, so that 평가 모델이 자기 결과를 정답으로 삼지 않는다.
44. As a 운영자, I want 호출·토큰·지연·수정 성공률·실패율을 기록하기, so that 품질과 비용을 함께 판단한다.
45. As a 개발자, I want 한국어 평가 미완료 상태에서도 구현을 진행하기, so that 영어 공개 자료로 기능 검증을 시작한다.
46. As a 평가자, I want 한국어 품질 합격을 별도 조건으로 관리하기, so that AMI 결과가 실사용 성능을 대신하지 않는다.

## Implementation Decisions

### 책임과 기존 정책

- 기존 Discussion 분석 Service가 workflow를 소유한다. Controller는 인증·DTO 전달, Service는 정책·검증·단계 제어, Repository는 영속화·조건부 원자 쓰기를 담당한다. Repository가 HTTP DTO나 AI SDK를 가져오지 않는다.
- AI Adapter에 추출·의미 검증·수정 작업과 공급자별 구조화 출력·취소·usage를 표현한다. 도메인 입력·결과를 HTTP DTO와 공급자 SDK 형식에서 분리하고 DTO는 공통 계약을 재사용한다.
- 현재 TypeScript·Prisma·SQLite·Service/Adapter 경계를 유지한다. LangGraph·Python orchestration·동적 supervisor·worker fan-out은 도입하지 않는다.
- ADR-0014의 미합의 제안 제외 기준은 합의한 후보 정책으로 대체한다. ADR-0018/0019/0020/0021의 DB 권위·인간 검수·멱등성·스캔 coverage·Service 정책 소유는 유지한다.
- 입력 대화 밖의 과거 결정·최근 External Feedback을 prompt 근거로 주입하지 않는다. 대화 자체에 표현된 피드백은 입력으로 분석할 수 있다.
- 기존 수집·전처리 알고리즘과 같은 채널 직렬화를 유지하되, 이미 BE에 도착한 문제/제안 맥락을 합의 신호가 없다는 이유만으로 버리지 않는다. reply 분리·세션 slicing 뒤 대화에 없는 이유를 만들지 않는다. Bot의 자동 감지 범위를 전면 변경하는 작업은 포함하지 않는다.
- 사용자 추가 지시: Bot 시작·재연결 준비·새 서버 초대 시 과거 채널 자동 스캔을 생성하지 않는다. 평소에는 새 메시지·기존 이벤트 트리거를 추적하며, 과거 대화 스캔은 명시적인 Discord 스캔 명령 또는 사용자가 요청한 Sync Job으로만 시작한다. 이미 요청된 Job과 보관된 분석의 복구는 유지한다. 자동 스캔 제거는 별도의 작은 변경으로 먼저 적용한다.

### 후보와 그래프 계약

- Graph는 schemaVersion, requestId, guildId, 세션별 입력 범위, nodes, edges, discussionProblems를 갖는 분석 snapshot이다. 세션 사이 이름 일치만으로 노드를 병합하지 않는다.
- 기본 노드는 Topic, Issue, Decision Candidate, Alternative, Rationale, Action Item 6종이다. 각 노드는 문자열 id, type, 비어 있지 않은 summary를 갖는다. Topic은 주제, Issue는 해결할 문제·질문이며 후보 없는 Topic/Issue도 정상이다.
- Candidate에는 대화 관측 proposed/agreed/withdrawn/unclear, 순서 있는 요약 history, rationaleStatus stated/not_stated, category를 둔다. 이 관측은 서비스의 Decision State와 독립이다. 역사 항목의 시각은 입력에 있는 경우만 nullable 값으로 기록한다.
- Alternative에는 별도의 관측 결과를 둔다. 명시적 결과가 없으면 null이다. 한 대안 채택으로 다른 대안 거절을 추정하지 않는다. 관계를 통해 후보에 연결한다.
- Action Item의 담당자·기한은 언급된 경우만 기록한다. 미기록은 null/누락으로 일관되게 표현하고 기본 담당자·미래 기한을 만들지 않는다.
- 내용은 AI 요약이다. 메시지별 출처와 verbatim 인용은 필수가 아니고, 생성 요약을 직접 인용으로 표시하지 않는다. 단, 요청 단위 원본 입력과 provenance는 재개·진단용으로 유지한다.
- 근거가 미언급이면 Rationale 노드를 만들지 않고 rationaleStatus로 구별한다. 기존 카드의 문자열 rationale은 빈 값으로 표현할 수 있도록 공통 계약을 확장한다. ‘성능 때문’이나 ‘근거 미언급’ 같은 설명 문구를 실제 근거로 저장하지 않는다. 없는 근거를 허용하는 것은 topic·decision 등 필수 내용까지 빈 값을 허용한다는 뜻이 아니다.
- 카드 projection과 편집 검증도 근거 미언급을 일관되게 처리한다. 기존 필드 이름·문자열 타입·카테고리·페이지 계약을 유지하고 필요한 관측/미언급 정보는 additive 필드로 제공한다. 편집에서 근거가 입력되면 stated가 되고, 명시적으로 비우면 not_stated가 된다. 승인에는 근거를 새로 만들어 넣지 않는다.
- graph Candidate와 실제 Decision aggregate는 별도 식별자다. 신규 후보는 Draft이며 자동 approvedBy/confirmedDate/supersedesId를 생성하지 않는다. 동일 evidence·normalized content로 재사용된 기존 카드는 기존 상태를 유지한다.

| 관계 | 시작 → 끝 | 의미 |
| --- | --- | --- |
| contains | Topic → Issue/Decision Candidate, Issue → Decision Candidate | 소속 |
| has_alternative | Decision Candidate → Alternative | 선택지 |
| supports / opposes | Rationale → Decision Candidate/Alternative | 찬반 근거 |
| triggers | Decision Candidate → Action Item | 후속 과제 |
| conflicts_with | Candidate/Alternative ↔ Candidate/Alternative | 입력에 실제 있는 양립 불가능성 |
| depends_on | Candidate/Action Item → Candidate/Action Item | 시작 요소가 끝 요소를 전제로 함 |

- Edge는 문자열 id/type/sourceId/targetId를 갖는다. 충돌은 대칭 의미로 끝점 순서를 정규화하며 역방향 중복을 만들지 않는다. 동일 종류·끝점의 관계 중복과 자기 연결을 검사하고 중복 ID·끊어진 참조·허용되지 않은 종류 연결은 구조 오류로 처리한다.
- 관계는 입력에서 확인되는 것만 만든다. 같은 이름·동시 등장·같은 Topic만으로 충돌이나 Supersede를 만들지 않는다. 실제 순환 의존은 DAG 제약으로 삭제하지 않고 discussionProblems에 관련 node/edge ID와 요약을 기록한다.
- 담당자 없는 Action Item이나 대안의 이유 미언급은 정상이다. 근거/대안/후속 활동이 어느 후보와도 의미적으로 연결되지 않은 경우는 보정 대상이다. 미해결 문제 노드의 존재와 끊어진 참조 오류를 구분한다.
- AI는 단계 안의 임시 참조만 만들고 BE가 유효한 결과에 최종 ID를 발급한다. 참조·ID 매핑은 단계 checkpoint에 저장한다. 수정에서 동일 요소는 ID를 유지하고 추가 요소만 새 ID를 받는다. 새 재분석의 snapshot ID는 별도이며 실제 카드 재사용 여부와 혼동하지 않는다.

### 실행·예산·실패

- 흐름은 추출 → 코드 구조 검사 → AI 의미 검증 → 오류가 있으면 한 번 수정 → 코드 재검사 → AI 재검증이다. 후보·노드·관계·관측 이력을 첫 호출에서 함께 생성한다.
- 의미 검증은 원문과 결과를 비교해 누락 후보, 입력 밖 내용, 잘못된 합의·철회·대안 결과, 관계 오류를 issue 목록으로 반환한다. 검사 결과와 issue 목록은 서로 일관돼야 하며 malformed critic 응답을 통과로 해석하지 않는다.
- 구조 오류는 의미 검증 전에 같은 한 번의 수정 예산으로 보정한다. 의미 오류만 있는 경로는 최대 4회 논리적 AI 호출, 첫 구조 보정 경로는 최대 3회다. 이미 수정했다면 후속 오류에 추가 수정하지 않는다.
- 정상 경로는 추출·검증 2회다. 후보 없음도 검증하며 정상 맥락 그래프를 저장한다. 모든 룰에서 제외된 순수 잡담은 AI 분석 세션과 구별한 deterministic skip 결과로 기록하고 AI가 확인한 무결정으로 표현하지 않는다.
- 실제 상충 합의·철회·순환 의존을 충실히 기록한 결과는 정상이다. 이를 숨기거나 입력에 없는 모순을 만든 결과는 의미 오류다. Governance Score는 참고 지표로 유지하고 검증·자동 확정에 사용하지 않는다.
- 호출당 상한은 45초이고 세션의 누적 활성 시간 상한은 180초다. 재시도 대기는 제외하지만 실행·검사·통신 실패 시간은 포함한다. timeout은 남은 전체 예산보다 길 수 없다.
- 수정 횟수·논리 단계 수·실제 공급자 시도·토큰·실행 시간을 따로 저장한다. SDK의 숨은 자동 retry도 측정·제어 대상이며 예산을 우회하지 못한다.
- 일시 통신 장애는 남은 예산과 기존 bounded delivery 정책 안에서 같은 단계·요청을 재개한다. 설정 오류·영구 공급자 오류·최종 구조/의미 오류·불완전 출력·예산 소진은 실패로 보존한다. 불완전 출력은 안전하게 보정할 수 있는 구조 오류와 provider 응답 자체가 없는 통신 오류를 구별한다.
- 검증된 completed/후보 없음, retryable failure, terminal failure, 소유권 상실을 구별한다. terminal 요청 재전송은 저장된 실패를 반환하고 AI 호출이나 예산 초기화를 하지 않는다. 손상된 결과를 빈 후보 목록의 성공으로 바꾸지 않는다.
- 실제 유료 실행에는 명시적인 모델 설정·입출력 한도·총 예산이 필요하다. 구체적 토큰 수·금액·모델 최적화는 평가로 조정하며 조용한 입력 절단을 하지 않는다.

### 저장·재개·검수 연결

- AnalysisRequest를 확장해 원본 입력, fingerprint, 설정/prompt/schema 버전, 세션 목록, 결과·실패·소유권을 보존한다. requestId가 같고 입력이 다르면 conflict다. 같은 요청은 최초 고정 설정으로 재개하고 설정 변경을 적용하는 의도적 재분석은 새 ID다.
- 세션 checkpoint에는 추출/수정 결과, 검증 결과, 현재 단계, ID 매핑, 소비 예산을 저장한다. 단계 시도에는 owner·시작·deadline·종료·usage·오류를 기록한다. 재시작으로 시도 시간을 초기화하지 않고 저장된 deadline을 사용해 crash 기간을 보수적으로 정산한다.
- lease/heartbeat/owner fencing을 checkpoint와 최종 공개까지 적용한다. 소유권 상실 시 다음 호출·저장을 중단하고 가능한 경우 활성 호출을 취소한다. 늦은 응답도 이전 owner로 저장하지 않는다.
- AI 응답과 checkpoint 쓰기 사이 장애는 외부 호출의 exactly-once를 보장하지 못한다. 재호출이 필요할 수 있지만 수정·시간 소비는 잊지 않고, 결과 공개의 중복은 막는다.
- 한 요청의 모든 세션이 성공해야 Graph snapshot·후보 생성/재사용·CandidateAnalysis 연결·완료 응답을 같은 transaction으로 반영한다. 중간 결과는 검수 큐·카드 목록·검색·완료 그래프 조회에 노출하지 않는다.
- 한 세션이 terminal이면 요청 전체를 실패 보존한다. 완료 세션은 진단용으로 보관하고 부분 공개하지 않는다. transient이면 완료 checkpoint부터 재개한다.
- 완료 요청 재전송은 같은 저장 결과와 graph ID를 반환한다. 기존 후보 동일성·rejected evidence 억제·관련 후보 이력·수동 override·스캔 coverage 정책을 유지한다.
- 저장 모델은 AnalysisRequest, 세션 checkpoint, 단계 시도, 완료 Graph snapshot 및 그래프 후보/실제 카드 연결을 명확히 구분한다. 그래프 payload는 버전 있는 JSON으로 저장해도 되며 별도 그래프 DB는 요구하지 않는다.
- 완료 snapshot의 AI 내용은 불변이다. 노드의 decisionId·analysis시점 decisionVersion과 현재 카드 version을 연결해 edited/reviewed/stale 여부를 구별한다. 현재 카드 조회를 과거 snapshot 안에 덮어쓰지 않는다.
- additive migration으로 기존 Decision·분석 이력·승인·checkpoint를 보존한다. 과거 요청에 입력·그래프가 없으면 unavailable로 표현하고 재분석이나 가짜 그래프를 자동 생성하지 않는다. 자동 테스트·개발 migration은 격리 DB에서 수행하며 운영 DB 적용은 별도 작업이다.

### API와 접근 권한

- 기존 Bot용 `POST /api/discussions/analyze`와 서비스 인증을 유지한다. 응답의 기존 found/summary/decisions를 유지하면서 requestId·graphAvailable 등의 메타데이터를 추가한다. found는 실제 반환 후보 존재와 일치하며 대화상 합의 존재를 의미하지 않는다.
- `GET /api/v1/analysis-requests/{requestId}/graph?guildId=...`는 완료된 schemaVersion·requestId·세션별 nodes/edges/problems·실제 카드 연결과 분석 당시 버전을 반환한다. AI 입력 원문 전체와 단계 진단은 이 일반 그래프 응답에 자동 포함하지 않는다.
- `GET /api/v1/analysis-requests/{requestId}?guildId=...`는 사용자용 상태·현재 단계·비민감 오류 category·retryable 여부·소비 예산·graphAvailable을 반환한다. provider credentials·원시 stack·owner token을 노출하지 않는다.
- 기존 카드 analysis history에 graphAvailable·graph 조회에 필요한 requestId·해당 candidateNodeIds 정보를 추가해 여러 분석과 카드의 관계를 표현한다. 기존 목록·상세 응답에서 새 모델로 일괄 교체하지 않는다.
- 모든 v1 조회는 JWT와 실제 요청의 guild 접근을 확인한다. query guildId와 요청 저장 guild가 다르면 접근을 허용하지 않는다. Bot 전용 인증을 브라우저에 전달하지 않는다.
- 상태 조회는 미완료/실패도 제공하지만 graph 조회는 처리 중이면 conflict, 최종 실패면 검증 실패, 존재하지 않거나 legacy graph가 없으면 not found로 구별한다. v1 응답은 현재 success/code/message/data envelope와 공통 오류 체계를 따른다.
- 기존 retained failure 재시도는 같은 ID의 통신 재전송이다. terminal validation/budget 실패는 그 방식으로 다시 실행하지 않는다. 새 입력/설정의 수동 재분석은 새 요청 ID와 이전 분석 연결을 만들며 기존 Bot 수동 분석 경로를 재사용한다. 별도 사용자 취소/재분석 API를 불필요하게 추가하지 않는다.
- TSOA 응답·오류·권한·nullable·enum을 실제 계약에 맞춰 선언한다. FE 화면·생성 클라이언트 소스 작업은 이 spec에서 하지 않는다.

### 평가와 기존 작업 인계

- AMI 공식 scenario-only dev 20개로 조정하고 test 20개로 최종 비교한다. 긴 회의를 분할하더라도 회의 단위로 결과를 모은다. 정답 요약을 모델 입력에 섞지 않고 공식 분할을 임의 40/10 분할로 바꾸지 않는다.
- AMI 결정 요약은 기초 평가다. 요약에 없는 제안을 곧바로 FP로 간주하지 않고 graph/candidate 전체 재현율을 주장하지 않는다. 원래 결정 라벨과 우리 추가 gold는 구별한다.
- 서비스 gold는 제안·합의·철회·대안·근거 없음·문제만 있음·모순을 포함한 완전 주석 구간이다. AI 초안을 사람이 확인하고 최종 gold를 고정한다. 초기 50개는 목표 규모이며 실제 독립 회의 수·한국어 확보로 확정한다.
- 초기 수용 목표는 완전 주석 서비스 셋의 허위 합의·입력 밖 근거/담당자/기한 0건, 후보 및 관계 precision/recall 각각 90% 이상, 제출 그래프 구조 오류 0건이다. 계산 불가능한 값은 N/A며 실패 요청을 집계에서 숨기지 않는다.
- 후보는 의미 일대일 대응, 관계는 대응 노드와 종류/방향으로 평가한다. 생성 ID나 요약 문장 문자열 일치를 정답으로 요구하지 않고 중복 후보를 별도 TP로 세지 않는다.
- baseline과 새 workflow는 동일 입력·분할·provider/model 조건으로 실행한다. 모델·prompt·schema·출력 한도·gold 버전·원본 checksum을 manifest에 고정하고 호출·토큰·지연·수정 성공률·실패율을 함께 보고한다.
- 실제 외부 AI 평가는 명시적 별도 runner다. 기본 테스트는 외부 AI를 호출하지 않는다. 한국어 gold 준비 전에도 구현을 진행하지만 한국어 품질 합격과 실제 공급자 연결 확인은 별도 검증 상태로 관리한다.
- 기존 공급자 주입 경계·Gemini 출력 계약·오류 처리·live smoke는 새 단계에 통합한다. 빈 근거 일괄 거절과 원문 인용 필수 검증 초안은 이 계약으로 대체한다. 기존 7개 draft를 그대로 구현하지 않고 새 tracer-bullet 티켓으로 재분배한다.

## Testing Decisions

- 확정한 주 경계는 실제 BE HTTP API + 격리된 Prisma/SQLite + 단계별 고정 AI 응답 주입이다. 내부 helper 호출 횟수나 Prisma query 모양보다 API 결과·API 재조회·재시작 이후 결과·공개 여부를 검증한다.
- 기존 Discussion API·reliability API·검수 API 테스트가 선례다. 테스트 server factory와 임시 DB 구성을 확장해 하나의 분석·저장·조회 경계를 재사용한다. 보조 경계를 여러 새 mock 층으로 분산하지 않는다.
- 정상 제안, 합의 관측, 경쟁 대안, 철회 이력, 근거/담당자/기한 없음, 문제만 있는 그래프, 입력 밖 사실을 고치거나 실패 보존하는 사례를 검증한다.
- malformed 구조와 critic 응답, 끊어진 참조, 중복 ID, 잘못된 관계 종류, 대화상 모순/순환 의존의 정상 보존, 코드 수정 예산과 의미 수정 예산 공유를 검증한다.
- 재시작 후 추출 재사용, 동일 ID·다른 입력 conflict, terminal 재전송의 무호출, 새 request 재분석, 시간·수정 예산 유지, stale owner late response 차단을 실제 저장 결과로 확인한다. 제어된 시계·AI 호출 barrier는 시간 경계에 한정한다.
- 다중 세션 중 마지막 실패에서 중간 후보/그래프가 공개되지 않는지, commit 실패 후 중복 없이 완료되는지, 완료 재전송의 같은 ID·결과를 검증한다.
- 사람의 편집·확정·교체 이후 snapshot 불변과 현재 version 차이, 같은 카드의 여러 분석 이력, 다른 guild 요청·그래프 접근 거절, legacy graph unavailable을 검증한다.
- 공급자 fixture 검사는 기존 Adapter 테스트를 보강한다. 실제 SDK/HTTP parse·schema·refusal/빈 응답·불완전 출력·permanent/retryable 오류·timeout·숨은 retry 제어를 검증한다. 외부 provider 연결이나 정확성을 확인했다는 뜻은 아니다.
- AMI 변환 도구의 NXT range/발화 연결/분할/checksum 검사를 재사용한다. 평가 runner는 입력·gold 분리, 누출 방지, 의미 대응 집계, N/A, 예산 소진·실패 보고를 로컬 fixture로 확인한다. gold 품질과 모델 품질은 사람 검수·별도 실제 평가로 확인한다.
- 구현 중 변경에 맞는 개별 테스트와 typecheck를 수행하고 통합 완료 시 전체 suite를 한 번 실행한다. Swagger 계약·문서 정합성과 Standards/Spec 리뷰를 완료한다. live AI 실행은 기본 suite에 넣지 않는다.

## Out of Scope

- AI의 서비스 상태 자동 확정·자동 Supersede, 과거 결정 retrieval·입력 밖 External Feedback 주입.
- FE 화면·좌표·레이아웃·React Flow/ELK, FE 소스·생성 클라이언트 수정.
- 새 학습형 전처리·분류기 도입, Bot admission 전면 개편, 그래프 DB 도입, 동적 multi-agent routing.
- 기존 feedback 전역 API의 guild형 개편, 별도 사용자 취소 API, 별도 새 브라우저 재분석 API.
- 모델의 신규 학습·fine-tuning, 평가셋 밖 정확성 보장, 한국어 평가 미완료 상태의 품질 합격 주장.
- 실제 유료 provider 호출·대규모 평가 실행·운영 DB 적용·배포는 spec 게시나 기본 구현 테스트에 포함하지 않는다.

## Further Notes

- 출처는 [완료된 설계 map](../be-agentic-decision-design/map.md)의 6개 결정 티켓이다. 이 spec이 구현을 위한 통합 계약이며 역사적 draft와 충돌하면 이 계약을 따른다.
- [AMI 준비 결과](../../docs/research/ami-evaluation-preparation.md)에 다운로드·변환·검증·공식 분할·논증 주석 inventory를 기록했다. 142개 회의와 694개 결정 요약을 확보했지만 우리 전체 candidate/graph gold와 한국어 gold는 아직 준비되지 않았다.
- [워크플로우 조사](../../docs/research/be-agentic-decision-workflow-options.md)의 구조화 출력은 의미 정확성 보장이 아니라는 한계를 반영했다. 최대 수정 한 번·시간 상한은 사용자 합의한 초기 예산이지 실측 최적값이 아니다.
- 상태 ready-for-agent는 구현 명세의 tracker triage 역할이다. 앱 구현·외부 AI 연결·품질 목표 달성 완료를 뜻하지 않는다. 주 테스트 경계는 사용자와 확인했으며 답변은 아래 Comments에 기록한다.

## Comments

2026-10-14: 사용자가 설명을 확인한 뒤 ‘응 좋아’로 테스트 경계를 승인했다. 실제 HTTP API·임시 SQLite·고정 AI 응답으로 BE 처리 흐름을 검증하고, 실제 AI 연결·품질 평가는 별도로 실행한다. 보조 검사는 공급자 SDK/HTTP 처리와 평가 데이터 변환·집계에 한정한다.

2026-10-14: to-spec으로 합의한 결정들을 통합해 게시했다. 요구사항 인터뷰는 추가하지 않았다. 주 테스트 경계 확인 질문을 보냈으며 외부 AI 실행이나 앱 소스 변경은 수행하지 않았다.

2026-10-14: 사용자 추가 지시로 Bot ClientReady/GuildCreate의 자동 과거 스캔 호출을 제거하고 event 등록 의존성을 정리했다. 명시적 Discord 스캔/Sync Job, 새 메시지/반응 추적, 보관된 분석 복구는 유지한다. Bot build 및 기존 34개 테스트, offline ready/guild 이벤트 smoke, 변경 파일 Prettier와 diff check가 통과했다. Agentic workflow 구현이나 실제 Discord 연결 검증 완료를 뜻하지 않는다.
