# GGADDAK 기능 구조 및 아키텍처 레퍼런스

이 문서는 `docs/agents/`의 가이드라인([domain.md](domain.md), [frontend.md](frontend.md), [orchestration.md](orchestration.md))과 각 컨텍스트 문서([CONTEXT-MAP.md](../../CONTEXT-MAP.md), [CONTEXT.md](../../CONTEXT.md), [BE CONTEXT](../../apps/be/CONTEXT.md), [Bot CONTEXT](../../apps/bot/CONTEXT.md), [Shared CONTEXT](../../packages/shared/CONTEXT.md))를 기준으로 **현재 구현된 전체 기능 구조와 모듈 경계**를 정리한 에이전트용 레퍼런스다.

- 작업 시 이 문서에 정리된 **표준 도메인 어휘**를 사용하고, 동의어로 변형하지 않는다.
- 아키텍처 결정을 변경하거나 예외를 둘 경우 관련 [ADR](../../docs/adr/)과의 충돌 여부를 먼저 확인한다.

---

## 1. 모노레포 컨텍스트 경계

| 워크스페이스 | 패키지/경로                                                           | 핵심 책임                                                                                                                                                                                                         |
| ------------ | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Bot**      | `@ggaddak/bot` ([apps/bot](../../apps/bot))                           | Discord 게이트웨이 이벤트/슬래시 커맨드 수신, `Harvesting Window` 기반 `Discussion Context` 수집, 파일 기반 `Egress Queue` 전송, 과거 `Scan Range` 동기화 워커 실행                                               |
| **BE**       | `@ggaddak/be` ([apps/be](../../apps/be))                              | Express v5 + TSOA 기반 REST API, `Durable Receipt` 및 `Analysis Queue`, 중앙 전처리 및 에이전틱 AI 그래프 추출·검증·교정, `Review Queue`·`Decision Record`·`Why Search` 영속화(Prisma/SQLite)                     |
| **Shared**   | `@ggaddak/shared` ([packages/shared](../../packages/shared))          | 공통 도메인 타입, Zod 스키마, Tier-1 필터, 대화 스레드 분리기, 시맨틱 후보 판별기, 정책 상수, 통합 로거                                                                                                           |
| **FE**       | `apps/frontend-main` ([apps/frontend-main](../../apps/frontend-main)) | 독립 Git submodule(`likelion-kkadak/frontend`). Discord OAuth2 로그인, 대시보드, `Review Queue`, `Decision Record` 목록/상세/편집, 타임라인, Why 검색, 채널 설정 UI. 수정 시 [frontend.md](frontend.md) 절차 준수 |

---

## 2. 표준 도메인 어휘 (Vocabulary Check)

에이전트가 이슈, 코드, 테스트, 문서를 작성할 때 반드시 지켜야 하는 용어 경계다.

- **Discussion Context** (피해야 할 표현: Chat Log, Transcript, Raw Messages): Bot이 수집해 BE로 전달하는 작성자·시각·답글 관계가 보존된 메시지 윈도우.
- **Analysis Request** vs **AI Call**: `Analysis Request`는 하나의 `Discussion Context`에 대한 전체 분석 요청(재시도 포함)이고, `AI Call`은 그 내부에서 실행되는 개별 AI Provider 호출(Extract/Verify/Repair)이다.
- **Durable Receipt** vs **Analysis Queue**: Bot → BE 수신 확인(`Durable Receipt`)은 분석 성공이 아니라 입력과 처리 의도의 영속화를 뜻하며, 실제 실행·재시도는 BE의 `Analysis Queue`가 소유한다.
- **Decision Candidate** vs **Decision Record**: AI가 추출한 `Draft` 상태의 후보는 `Decision Candidate`이며, 사람이 `Review Queue`에서 확정한 뒤에만 `Decision Record`(`Decided` / `Superseded`)가 된다.
- **Observation vs Decision State**: 대화에서 관찰된 `proposed` / `agreed` / `withdrawn` / `unclear`는 논의 관찰값(`DecisionObservation`)이고, `Draft` / `Decided` / `Rejected` / `Superseded`는 사람의 검수 생명주기(`DecisionState`)다.
- **Supersede / Independent Retention / Pivot**: 기존 결정을 대체 무효화하면 `Supersede`, 기존 기록과 별개로 확정하면 `Independent Retention`, 외부 피드백(`External Feedback`)에 기반한 전략 전환은 `Pivot`으로 기록한다.
- **Evidence Hash / Governance Score**: `Evidence Hash`는 거절된 후보의 자동 재생성을 막는 결정론적 해시이며, `Governance Score`는 근거 길이·참여자 수·반응 수·Action Item 유무를 바탕으로 1.0~4.0으로 산출하는 합의 신뢰도 점수다.

---

## 3. 기능별 전체 구조

### 3.1. Discord 수집 및 신뢰성 전달 (`@ggaddak/bot` → `@ggaddak/be`)

1. **실시간 트리거 및 수집**
   - [message.handler.ts](../../apps/bot/src/handlers/message.handler.ts), [reaction.handler.ts](../../apps/bot/src/handlers/reaction.handler.ts), [harvester.service.ts](../../apps/bot/src/services/harvester.service.ts)
   - `@ggaddak/shared`의 `admitsDiscussion`([admission.ts](../../packages/shared/src/admission.ts))이 `CONSENSUS_REGEX`, `evaluateSemanticDecision`([semantic-scorer.ts](../../packages/shared/src/semantic-scorer.ts)), 인간 리액션 임계치(`humanReactionCount`)를 검사해 트리거 여부를 판별한다.
   - 채널별 debounce 및 직렬화([channel-scheduler.ts](../../apps/bot/src/services/channel-scheduler.ts)) 후 앞뒤 문맥과 답글 체인을 `Harvesting Window`로 묶어 `Discussion Context`를 구성한다.
   - 봇의 상태 표시 이모지(`👀` → `📝` 등)는 `humanReactionCount` 집계에서 제외한다.

2. **과거 대화 스캔 및 동기화 (`Sync Job`)**
   - 수동 커맨드([scan.command.ts](../../apps/bot/src/commands/scan.command.ts)) 및 웹 대시보드 동기화 요청(`POST /api/v1/sync-jobs`)을 [sync-job-worker.ts](../../apps/bot/src/services/sync-job-worker.ts)가 claim·리스 갱신하며 채널별로 실행한다.
   - 스캔 구간(`Scan Range`)은 누락 없이 전달된 범위 기준으로만 `Channel Checkpoint`([checkpoint.controller.ts](../../apps/be/src/api/controllers/checkpoint.controller.ts))를 전진시킨다([ADR-0020](../adr/0020-analysis-delivery-and-scan-coverage.md)).

3. **전달 보장 (`Egress Queue` & `Durable Receipt`)**
   - Bot은 파일 저널(`Egress Queue`, `ANALYSIS_DELIVERY_DIR`)에 요청을 영속화한 뒤 BE 내부 큐(`POST /api/v1/internal/analysis-queue/receipts`) 또는 동기 엔드포인트(`POST /api/discussions/analyze`)로 전송한다.
   - BE [analysis-queue.service.ts](../../apps/be/src/services/analysis-queue.service.ts)는 입력과 처리 의도를 DB에 저장해 `Durable Receipt`를 발급하고, 백그라운드 재시도·완료 결과 조회(`results`)·확인(`ack`)을 관리한다([ADR-0023](../adr/0023-durable-receipt-and-backend-analysis-queue.md)).
   - 길드 설치 상태(`Bot Installation Status`) 및 접근 권한 변경은 [guild-access.events.ts](../../apps/bot/src/events/guild-access.events.ts) → [guild-access.controller.ts](../../apps/be/src/api/controllers/guild-access.controller.ts)로 동기화한다([ADR-0026](../adr/0026-event-coverage-and-rate-limited-guild-verification.md)).

---

### 3.2. 백엔드 AI 분석 파이프라인 (`@ggaddak/be` + `@ggaddak/shared`)

```
Discussion Context
  └─▶ [1] 전처리 & 세션 분할 (prepareAnalysis)
        ├─ filterTier1Messages: 봇/명령어/추임새 제거, 단답 동의를 syntheticReactions로 흡수
        ├─ disentangleConversations: 60s 버스트 병합 + 답글/멘션/근접 시간 기반 스레드 분리
        └─ sliceSessionWithTopicDrift: 30m 유휴 간격 + TextTiling 주제 전환 분할 → 원문 복원
  └─▶ [2] 실행 리스 & AI 호출 스케줄링
        ├─ AnalysisRunner: 요청 claim + 5초 하트비트 리스 유지
        └─ AiCallScheduler: SQLite 기반 프로세스 간 FIFO 슬롯 (AI_CALL_CONCURRENCY)
  └─▶ [3] 세션별 에이전틱 상태 머신 (GraphWorkflow)
        ├─ Extract (AI) → Check (Zod + graphIssues)
        ├─ Verify (AI 비판 검증) ─[결함 시 최대 1회]→ Repair (AI) → Recheck → Reverify (AI)
        └─ Link & Done (임시 ID → 전역 UUID 치환, 세션 완료)
  └─▶ [4] 후보 투영 & 원자적 발행
        ├─ projectCandidates: DecisionCandidate, Alternative, Rationale, ActionItem, GovernanceScore(1~4) 매핑
        └─ CandidatePublicationService: CandidateIdentity/EvidenceHash 대조·억제 후 단일 트랜잭션 커밋
```

- **에이전틱 그래프 검증 규칙** ([decision-graph.ts](../../apps/be/src/domain/decision-graph.ts)):
  - 노드 타입: `Topic`, `Issue`, `DecisionCandidate`, `Alternative`, `Rationale`, `ActionItem`
  - 엣지 타입: `contains`, `has_alternative`, `supports`, `opposes`, `triggers`, `conflicts_with`, `depends_on`
  - `graphIssues()`가 ID 중복, 허용되지 않은 엣지 엔드포인트, self-edge, 고립 노드(`Alternative`/`Rationale`/`ActionItem`), `rationaleStatus`와 `supports`/`opposes` 엣지 불일치, `discussionProblems` 참조 무결성을 결정론적으로 검증한다.
- **리소스 및 시간 예산** ([policies.ts](../../apps/be/src/config/policies.ts)):
  - 세션당 `maxRepairs: 1`, `maxLogicalCalls: 4`, `sessionBudgetMs: 180_000`, `callTimeoutMs: 20_000`.
  - 다중 세션 요청은 모든 세션이 `Done`에 도달해야 최종 `GraphSnapshot`과 후보를 원자적으로 공개하며([discussion.service.ts](../../apps/be/src/services/discussion.service.ts)), 중간 실패 시 완료된 세션은 체크포인트에 보존된다.
- **AI Provider 경계** ([ai.adapter.ts](../../apps/be/src/adapters/ai.adapter.ts), [ai-provider-factory.ts](../../apps/be/src/adapters/ai-provider-factory.ts)):
  - `nvidia` (기본값, [nvidia-provider.ts](../../apps/be/src/adapters/nvidia-provider.ts), [ADR-0025](../adr/0025-nvidia-nim-ai-provider.md)): OpenAI SDK 스트리밍으로 NVIDIA NIM(`nvidia/nemotron-3.5-super-vl-120b-a12b`) 호출, `enable_thinking` 제어 및 `extractAndParseJson` 파싱.
  - `agy` ([agy-provider.ts](../../apps/be/src/adapters/agy-provider.ts), [agy-cli.ts](../../apps/be/src/adapters/agy-cli.ts), [ADR-0024](../adr/0024-agy-provider-boundary.md)): 임시 디렉토리와 `tools: [finish]`만 허용된 격리 `agy` CLI 서브프로세스로 실행.
  - `mock`: `development`/`test` 환경에서만 허용.
  - 단계별 모델 오버라이드(`AI_MODEL_EXTRACT`, `AI_MODEL_VERIFY`, `AI_MODEL_REPAIR`) 및 요청 시작 시 설정 스냅샷 보존 지원.
- **AI 관측성 및 평가**:
  - 메트릭/로그([ai-metrics-logger.ts](../../apps/be/src/adapters/ai-metrics-logger.ts)): 호출 단위 지연시간, TTFT, 토큰, 실패 단계/종류를 기록하며 Loki 라벨 카디널리티와 원문 비노출 경계 준수([ADR-0027](../adr/0027-ai-observability-labels-and-raw-evidence.md)).
  - 평가 하네스([evaluation/runner.ts](../../apps/be/src/evaluation/runner.ts)): 토큰/호출 예산(`budgetProvider`) 내에서 단일 프롬프트 baseline 대비 그래프 워크플로우 성능을 평가.

---

### 3.3. 검수, 편집, 조회 및 의미 검색 (`@ggaddak/be`)

| 기능 영역                       | 주요 컨트롤러 / 서비스                                                                                                                                                                                                                                                                                                                             | 핵심 동작                                                                                                                                                                                                                                  |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Review Queue & 확정**         | [v1-review.controller.ts](../../apps/be/src/api/controllers/v1-review.controller.ts)                                                                                                                                                                                                                                                               | `Draft` 후보 목록 조회 및 검수 확정(`Decided`), 반려(`Rejected`, `RejectedEvidenceHash` 기록), 기존 기록 `Supersede`·미완료 `ActionItem` 이관, `Independent Retention`, `Pivot` 처리([ADR-0019](../adr/0019-web-owned-decision-review.md)) |
| **Decision 조회/편집/타임라인** | [v1-decision.controller.ts](../../apps/be/src/api/controllers/v1-decision.controller.ts), [decision.service.ts](../../apps/be/src/services/decision.service.ts)                                                                                                                                                                                    | 길드별 목록/상세 조회, 낙관적 버전 충돌 검사를 동반한 편집(`PUT /api/v1/decisions/{id}`), 수정 이력(`history`), 주제/월/채널/카테고리별 타임라인(`timeline`)                                                                               |
| **분석 상태 & 그래프 조회**     | [analysis-request.controller.ts](../../apps/be/src/api/controllers/analysis-request.controller.ts), [analysis-deliveries.controller.ts](../../apps/be/src/api/controllers/analysis-deliveries.controller.ts)                                                                                                                                       | `Analysis Request` 진행 상태 및 세션별 실패 진단 조회, 저장된 `GraphSnapshot` 조회, 실패한 전달 건 조회/수동 재시도                                                                                                                        |
| **Why 의미 검색**               | [search.controller.ts](../../apps/be/src/api/controllers/search.controller.ts), [search.service.ts](../../apps/be/src/services/search.service.ts)                                                                                                                                                                                                  | `Decided`/`Superseded` 상태의 결정 문서에 대해 `OpenAIEmbeddingProvider`(`text-embedding-3-small`)로 벡터를 생성·SQLite 캐시(`DecisionEmbedding`, `contentHash` 검증)하고 코사인 유사도로 관련 기록과 출처 발췌 반환                       |
| **대시보드 & 외부 피드백**      | [dashboard.controller.ts](../../apps/be/src/api/controllers/dashboard.controller.ts), [feedback.controller.ts](../../apps/be/src/api/controllers/feedback.controller.ts), [feedback.command.ts](../../apps/bot/src/commands/feedback.command.ts)                                                                                                   | 확정/대기/보류 요약 및 최신 Sync Job 상태 제공, 멘토/외부 이해관계자 피드백 등록·조회                                                                                                                                                      |
| **인증·권한·채널 설정**         | [auth.controller.ts](../../apps/be/src/api/controllers/auth.controller.ts), [channels.controller.ts](../../apps/be/src/api/controllers/channels.controller.ts), [bot-installation.controller.ts](../../apps/be/src/api/controllers/bot-installation.controller.ts), [policy.controller.ts](../../apps/be/src/api/controllers/policy.controller.ts) | Discord OAuth2 로그인 및 HttpOnly 세션 쿠키, 길드 접근 권한 가드, 모니터링 채널 등록/조회, 봇 설치 상태 확인, Bot 정책 동기화                                                                                                              |

---

### 3.4. 프론트엔드 화면 구조 (`apps/frontend-main`)

해시 라우터([router.js](../../apps/frontend-main/src/router.js))와 셸([Shell.jsx](../../apps/frontend-main/src/screens/Shell.jsx)) 기반의 SPA로, TSOA OpenAPI 스펙에서 생성한 API 계약(`npm run api:sync`, [ADR-0017](../adr/0017-tsoa-code-first-openapi-and-orval-codegen.md))을 통해 BE와 통신한다.

- **인증/온보딩**: `Landing` → `OAuthCallback` → `Setup` (길드 선택, 봇 설치 상태/권한 확인)
- **워크스페이스 화면**:
  - `dashboard` ([DashboardPage.jsx](../../apps/frontend-main/src/pages/DashboardPage.jsx)): 현황 지표 및 수동 동기화(`SyncButton`)
  - `review` ([ReviewPage.jsx](../../apps/frontend-main/src/pages/ReviewPage.jsx)): `Review Queue` 후보 검수(승인/수정/거절/`Supersede`)
  - `list` / `decision` ([ListPage.jsx](../../apps/frontend-main/src/pages/ListPage.jsx), [DetailPage.jsx](../../apps/frontend-main/src/pages/DetailPage.jsx)): 결정 목록, 상세, 편집 및 이력, 원문 근거 확인
  - `search` ([SearchPage.jsx](../../apps/frontend-main/src/pages/SearchPage.jsx)): Why 자연어 의미 검색
  - `timeline` ([TimelinePage.jsx](../../apps/frontend-main/src/pages/TimelinePage.jsx)): 결정 타임라인 및 변천 추적
  - `settings` ([SettingsPage.jsx](../../apps/frontend-main/src/pages/SettingsPage.jsx)): 모니터링 채널 관리 및 전송 상태 점검

---

## 4. 기존 문서 대비 최신 코드 주의사항 (Agent Notes)

에이전트가 작업 전 다른 문서를 함께 읽을 때 아래 사항을 우선한다.

1. **기본 AI Provider 변경**: [README.md](../../README.md)나 초기 문서(`docs/decision-features.md`)는 `agy` CLI를 기본 Provider로 설명하고 있으나, 현재 코드([policies.ts](../../apps/be/src/config/policies.ts), [ADR-0025](../adr/0025-nvidia-nim-ai-provider.md))에서는 `nvidia`가 기본 `AI_PROVIDER`이며 `agy`와 공존한다.
2. **현재 확인된 구현 주의점**:
   - [extractor-core.ts](../../apps/be/src/engine/extractor-core.ts#L130-L147)의 `sliceSessionWithTopicDrift`는 TextTiling 분할이 발생한 분기에서 100개 메시지 상한 재분할을 수행하지 않는다.
   - [search.service.ts](../../apps/be/src/services/search.service.ts#L138-L150)의 `search()`는 요청 시점에 미색인 결정을 순차 임베딩하므로 데이터 증가 시 지연이 발생할 수 있다.
