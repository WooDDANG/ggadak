# Discord Bot 구성 및 아키텍처 다이어그램 (Discord Bot Architecture)

이 문서는 GGADDAK 의사결정 추적 시스템의 **Discord Bot (`apps/bot`) 내부 구성, 이벤트 핸들링 파이프라인, 그리고 백엔드/프론트엔드와의 연동 아키텍처**를 설명합니다.

---

## 1. 전체 시스템 통합 아키텍처 (High-Level Topology)

```mermaid
flowchart TD
    subgraph DiscordPlatform["Discord Server (Guild)"]
        Chat["💬 채널 대화 발화<br/>(실시간 채팅)"]
        Pin["📌 핀 이모지 반응<br/>(수동 트리거)"]
        Slash["⚡ 슬래시 커맨드<br/>(/스캔, /피드백입력)"]
        BotReaction["👀 ➔ 📝 이모지 반응<br/>(Silent 피드백)"]
    end

    subgraph DiscordBot["apps/bot (Discord.js Bot Service)"]
        Client["Discord Client<br/>(Gateway Event Loop)"]
        
        subgraph EventHandlers["이벤트 라우터 & 핸들러"]
            MsgHandler["Message Handler<br/>(정규식 + 20-Anchor Dense Embedding)"]
            RxnHandler["Reaction Handler<br/>(📌 감지 & Override)"]
            CmdHandler["Command Handler<br/>(/스캔, /피드백입력)"]
        end

        subgraph CoreServices["핵심 수집 및 통신 모듈"]
            Harvester["Discussion Harvester<br/>(비대칭 컨텍스트 윈도우 수집<br/>Before 15 + Trigger + After 5)"]
            LockManager["In-flight Concurrency Lock<br/>(채널별 중복 분석 방지)"]
            BackendClient["Backend API Client<br/>(HTTP REST)"]
        end
    end

    subgraph BackendService["apps/be (Node.js / Express / TSOA)"]
        Slicer["Session Slicer<br/>(30분 유휴 갭 분할)"]
        AIEngine["AI Extractor Core<br/>(Google Gemini 2.5 Flash / GPT-4o-mini)"]
        GovRubric["4-Tier Governance Scorer<br/>(4.0 Strong ~ 1.0 Incomplete)"]
        AntiRecreate["Anti-Recreation Guard<br/>(Evidence Hash 중복 방지)"]
        DB[(SQLite / Prisma DB)]
    end

    subgraph FrontendDashboard["apps/fe (React / Tailwind)"]
        ReviewQueue["PM 검토 대기 큐<br/>(Confirm / Defer / Reject)"]
        Timeline["의사결정 타임라인 & 히스토리"]
        TranscriptViewer["Discord 대화 원문 뷰어<br/>(DiscordTranscriptViewer)"]
    end

    %% Ingestion Flow
    Chat -->|messageCreate| Client
    Pin -->|messageReactionAdd| Client
    Slash -->|interactionCreate| Client

    Client --> MsgHandler
    Client --> RxnHandler
    Client --> CmdHandler

    MsgHandler -->|의사결정 후보 감지 & 5초 디바운스| Harvester
    RxnHandler -->|강제 수집 요청| Harvester
    CmdHandler -->|수동 스캔 요청| Harvester

    Harvester <--> LockManager
    Harvester -->|1. 분석 시작: 👀 부착| BotReaction
    Harvester -->|2. POST /api/discussions/analyze| BackendClient

    BackendClient --> Slicer
    Slicer --> AntiRecreate
    AntiRecreate --> AIEngine
    AIEngine --> GovRubric
    GovRubric --> DB

    BackendClient <--|결과 응답| Harvester
    Harvester -->|3. 완료: 📝 부착| BotReaction

    DB --> ReviewQueue
    DB --> Timeline
    ReviewQueue --> TranscriptViewer
    Timeline --> TranscriptViewer
```

---

## 2. Discord Bot 내부 처리 파이프라인 (Bot Ingestion & Analysis Flow)

```mermaid
flowchart LR
    subgraph TriggerPhase["1. 트리거 감지"]
        A1["실시간 메시지 인입"] --> B1{"합의 키워드 OR<br/>Dense 임베딩 >= 0.70?"}
        B1 -- YES --> C1["5초 Debounce 대기"]
        B1 -- NO --> D1["무시 (Casual Chatter)"]
        
        A2["📌 핀 이모지 추가"] --> C2["수동 Override 트리거"]
        A3["/스캔 슬래시 커맨드"] --> C3["범위 수동 스캔"]
    end

    subgraph HarvestingPhase["2. 컨텍스트 수집 & 락"]
        C1 & C2 & C3 --> E["채널 In-flight Lock 확인"]
        E -- "이미 처리 중" --> F["중복 요청 드롭"]
        E -- "처리 가능" --> G["Lock 획득"]
        G --> H["비대칭 윈도우 수집<br/>(이전 15개 + 현재 1개 + 이후 5개)"]
        H --> I["메시지에 👀 리액션 부착<br/>(분석 진행 상태 표시)"]
    end

    subgraph BackendPhase["3. 백엔드 AI 분석 & 저장"]
        I --> J["POST /api/discussions/analyze"]
        J --> K["30분 세션 분할 & AI 분석"]
        K --> L["4-Tier 거버넌스 평가 (1.0~4.0)"]
        L --> M["결정 요약, 근거 요약, 원문 인용 추출"]
        M --> N["Draft 상태로 DB 저장"]
    end

    subgraph CompletionPhase["4. 완료 및 피드백"]
        N --> O["Bot에 200 OK 응답"]
        O --> P["메시지에 📝 리액션 부착<br/>(검토 큐 등록 완료)"]
        P --> Q["In-flight Lock 해제"]
    end
```

---

## 3. 세부 컴포넌트 시퀀스 다이어그램 (End-to-End Sequence Diagram)

```mermaid
sequenceDiagram
    autonumber
    actor User as 팀원 (Discord)
    participant Bot as Discord Bot (apps/bot)
    participant Harvester as DiscussionHarvester
    participant BE as Backend API (apps/be)
    participant AI as Gemini 2.5 Flash
    participant DB as Prisma / SQLite
    actor PM as PM / 관리자 (Web FE)

    User->>Bot: "MVP 로그인 방식으로 카카오 단독 채택합시다"
    Note over Bot: Dense Multi-Anchor 임베딩 유사도 0.88 감지
    Bot->>Harvester: 5초 디바운스 후 수집 요청
    
    Harvester->>Harvester: In-flight Lock 획득
    Harvester->>Bot: 메시지에 '👀' 리액션 추가 (분석 중)
    Harvester->>Bot: 이전 15개 ~ 이후 5개 메시지 및 리액션 조회
    
    Harvester->>BE: POST /api/discussions/analyze (rawMessages, channelId)
    
    BE->>BE: 30분 유휴 갭 세션 슬라이싱 & Hash 중복 검사
    BE->>AI: 구조화 추출 프롬프트 전달 (결정/근거 요약, 인용구)
    AI-->>BE: Extracted Decision JSON 반환
    
    BE->>BE: 4-Tier 거버넌스 점수 산출 (4.0~1.0)
    BE->>DB: Decision (State: Draft) 저장
    BE-->>Harvester: 200 OK (Extracted Candidate List)
    
    Harvester->>Bot: 메시지에 '📝' 리액션 추가 (큐 등록 완료)
    Harvester->>Harvester: In-flight Lock 해제
    
    PM->>BE: GET /api/decisions?state=Draft
    BE-->>PM: 대기 안건 + 근거 요약 + 인용구 + 원문 대화 목록 반환
    PM->>PM: Discord 대화 원문 뷰어로 컨텍스트 확인 후 [승인] 클릭
    PM->>BE: POST /api/decisions/:id/review (action: confirm)
    BE->>DB: State -> 'Decided' 갱신
```

---

## 4. 디스코드 봇 핵심 모듈 구조 (Module Breakdown)

- **`src/bot/client.ts`**: Gateway Intents (`Guilds`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`) 구성 및 클라이언트 인스턴스화.
- **`src/handlers/message.handler.ts`**:
  - `evaluateDenseMultiAnchorSimilarity`: 20개 의사결정 앵커 벡터와의 최대 코사인 유사도가 0.70 이상이거나 키워드 매칭 시 트리거.
  - 5초 슬라이딩 디바운스로 연속 대화 수렴 대기.
- **`src/handlers/reaction.handler.ts`**: 📌 이모지 반응 시 안티 재추출 해시 무시하고 즉각 강제 재분석 실행.
- **`src/commands/`**: `/스캔` (특정 범위 메시지 스캔), `/피드백입력` (외부 피드백 등록) 슬래시 커맨드.
- **`src/services/harvester.service.ts`**:
  - 채널별 동시 실행 방지 `Set<string>` Lock 관리.
  - 비대칭 윈도우 수집 (Before 15, After 5).
  - Silent 모드: 채널 텍스트 발송 없이 `👀` ➔ `📝` 이모지만으로 상태 전달.
- **`src/services/backend-api.service.ts`**: 백엔드 REST 엔드포인트(`POST /api/discussions/analyze`) 통신.
