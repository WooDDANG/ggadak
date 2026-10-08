# AI 에이전틱 기반 의사결정 도식화(Decision Mapping) 시스템 심층 아키텍처 및 핵심 기술 리서치

## 1. 개요 (Executive Summary)

현대의 협업 환경(Discord, Slack, Zoom, Google Meet 등)에서는 방대한 양의 비정형 대화와 회의 트랜스크립트가 생성되지만, 실제 조직의 중요한 의사결정(Decision), 대안(Alternatives), 근거(Rationale), 후속 조치(Action Item)는 대화의 파편화와 잡담 속에 매몰되기 쉽습니다.

본 리포트는 **비정형 대화 데이터를 수집·전처리하고, Agentic AI 워크플로우를 통해 정밀하게 의사결정 지식 그래프(DKG, Decision Knowledge Graph)를 추출한 뒤, 자동 레이아웃 엔진과 시각화 DSL(Mermaid, Excalidraw, XYFlow)로 렌더링하는 엔드투엔드 시스템 아키텍처**를 다룹니다.

---

## 2. 데이터 전처리 파이프라인 (Data Preprocessing Pipeline)

```
[Raw Streaming Input] (Slack/Discord/Transcripts)
         │
         ▼
[Step 1: Reply Hierarchy Reconstruction] (Kummerfeld 그래프 디스인탱글먼트)
         │
         ▼
[Step 2: Topic Drift & Boundary Segmentation] (Embedding-TextTiling + Sliding Window)
         │
         ▼
[Step 3: Casual Chatter vs Decision Hybrid Filtering] (Rules ➔ Embedding Bi-Encoder ➔ LLM Judge)
         │
         ▼
[Cleaned Struct Dialogue Session Segments]
```

### 2.1 세션 분할 및 토픽 드리프트(Topic Drift) 감지 기법
비정형 회의록이나 실시간 메신저 스트림은 명시적인 문단 구분이 없고 화자 간의 턴테이킹(Turn-taking)이 빈번하며 주제가 수시로 전환(Topic Drift)됩니다. 이를 해결하기 위해 전통적 어휘 응집도 알고리즘과 신경망 임베딩, LLM 듀얼 프로세스를 결합한 세션 분할 기법이 적용됩니다.

1. **Embedding-Enhanced TextTiling 알고리즘**:
   - Hearst(1997)의 전통적 TextTiling은 어휘 빈도(BoW) 기반 코사인 유사도로 주제 전환 경계(Valley)를 탐지했으나 동의어와 구어체에 취약합니다.
   - 현대 파이프라인에서는 각 발화(Utterance)를 Sentence-Transformers(예: `bge-large-en-v1.5`, `multilingual-e5-large`)로 벡터화한 뒤, 윈도우 $k$ 내 전후 발화 블록 간의 임베딩 코사인 유사도 곡선 $S(t)$를 계산합니다.
   - 유사도 하강점(Depth Score: $Depth(t) = (S_{peak\_left} - S(t)) + (S_{peak\_right} - S(t))$)이 임계치를 초과하는 지점을 1차 토픽 경계로 분할합니다.
   - 평가 척도로는 전통적인 $P_k$ metric 및 $WindowDiff (WD)$를 사용하여 정밀도를 벤치마킹합니다.
   - **Primary Source**: Hearst, M. A. (1997). *TextTiling: Segmenting Text into Multi-paragraph Subtopic Passages*. Computational Linguistics (https://aclanthology.org/J97-1003/).

2. **LLM Dual-Process Topic Drift Monitor**:
   - 단순 임베딩 거리는 일시적인 우스갯소리(Digression)와 실제 아젠다 전환을 구별하기 어렵습니다.
   - Fast-path(임베딩 거리 탐지) ➔ Slow-path(경계 구간 전후 5~10개 발화를 LLM에 입력하여 "안건 전환"인지 "단순 일탈 후 복귀"인지 제로샷/퓨샷 분류)의 2단계 검증(Dual-process reasoning)을 거칩니다.

### 2.2 답글 및 스레드 계층 트리 복원 (Reply Hierarchy Reconstruction)
Slack이나 Discord와 같은 채널형 메신저는 서로 다른 주제의 대화가 동일 시간대에 뒤섞여 발생하는 대화 얽힘(Conversation Entanglement) 문제가 존재합니다.

1. **대화 디스인탱글먼트 (Conversation Disentanglement)**:
   - Kummerfeld et al. (ACL 2019)의 모델링 방식에 기반하여, 메시지 시퀀스를 노드로 보고 "어떤 이전 메시지에 응답(Reply-To)하는가"의 방향성 엣지를 예측하는 링크 예측(Link Prediction) 문제로 공식화합니다.
   - 특성 추출(Feature Vector):
     - 시간적 거리 ($\Delta t$): 두 발화 간의 경과 시간 지수 감쇠
     - 멘션 및 사용자 일치 여부: @사용자, 화자 교대 패턴
     - 어휘 및 시맨틱 교차 어텐션: Cross-Encoder를 사용한 문맥 호응 점수
   - 트리 복원: 부모 노드로 예측된 확률이 가장 높은 이전 발화와 연결하여 Directed Forest(트리 숲)를 구축하며, 연결 성분(Connected Component) 단위로 독립된 대화 스레드를 분리해 냅니다.
   - **Primary Source**: Kummerfeld et al. (ACL 2019). *A Large-Scale Corpus for Conversation Disentanglement*. ACL Anthology (https://aclanthology.org/P19-1374/).

### 2.3 잡담(Chatter) 필터링 및 합의 신호(Consensus/Decision Signal) 감지 하이브리드 필터링
토큰 비용 절감 및 지식 추출 모델의 정확도를 위해 3-Tier 하이브리드 캐스케이드(Cascade) 아키텍처를 적용합니다.

1. **Tier 1: 결정론적 룰 기반 필터 (Deterministic Rule Filter)**:
   - 정규표현식 및 패턴 매칭: 짧은 인사말, 이모지 단독 발화, 봇 시스템 알림(`joined the channel`, `scheduled a call` 등) 필터링.
2. **Tier 2: 소형 Bi-Encoder 기반 제로샷/시맨틱 분류기**:
   - 훈련된 RoBERTa / DeBERTa 기반 의도 분류기(Intent Classifier)를 통해 발화를 4가지 범주로 분류:
     - `Casual Chatter` (잡담/인사)
     - `Information Sharing` (일반 정보 전달)
     - `Issue/Proposal Raising` (의제 제기 및 대안 제안)
     - `Consensus/Agreement` (합의, 거부, 최종 승인 신호)
   - 발화가 Issue/Proposal이나 Consensus 범주일 확률이 임계치 미만인 단순 잡담 세그먼트는 1차 드롭.
3. **Tier 3: LLM 컨텍스트 기반 검증 (Sliding-window LLM Judge)**:
   - 분류 경계값에 걸친 발화들을 전후 문맥과 함께 압축 프롬프트에 주입하여, 해당 턴이 실제 의사결정 컨텍스트에 필요한 정황 근거(Contextual Evidence)인지 최종 검증.

---

## 3. 에이전틱 AI 아키텍처 및 워크플로우 (Agentic AI Patterns)

의사결정 추출은 단순 단일 프롬프트 LLM 호출로는 복잡한 상충 관계(Trade-off), 폐기된 대안(Rejected Alternative), 최종 결정(Decision)의 인과 관계를 완벽히 포착하기 어렵습니다.

```
       [Segmented Conversation Threads]
                       │
                       ▼
         ┌───────────────────────────┐
         │ Orchestrator / Supervisor │
         └─────────────┬─────────────┘
                       │
           ┌───────────┴───────────┐
           ▼                       ▼
    [Extractor Worker 1]    [Extractor Worker 2]
    (Entity/Issue Extr.)    (Relation/Edge Extr.)
           │                       │
           └───────────┬───────────┘
                       │
                       ▼
           [State: Candidate Graph]
                       │
                       ▼
           [Conflict Detector Worker]
           (모순/이중결정/미해결 쟁점 검사)
                       │
                       ▼
           [Consensus Scorer Worker]
           (화자 권한, 동의율, 최종 승인 여부 평가)
                       │
                       ▼
           [Evaluator-Optimizer Loop]
              - 구조 정합성 통과? ──(No)──┐ (피드백 반영 재생성)
                       │ (Yes)             │
                       ▼                   │
           [DKG State Finalized] ──────────┘
```

### 3.1 멀티 에이전트 패턴 구성
1. **Orchestrator-Worker Pattern**:
   - **Orchestrator (Supervisor)**: 세션 메타데이터와 대화 분량을 감지하여 작업을 분할(Fan-out)하고, 각 작업자에게 특정 하위 스레드나 시점별 대화 분석을 위임한 후 결과를 병합(Fan-in).
   - **Extractor Workers**: 텍스트 청크로부터 IBIS(Issue-Based Information System) 기반의 노드(Issue, Decision, Alternative, Rationale, ActionItem)를 추출.
2. **Evaluator-Optimizer Pattern (Reflector/Critic Loop)**:
   - Extractor가 생성한 1차 그래프 상태를 Evaluator 에이전트가 검증.
   - 검증 항목:
     - "결정된 Decision에 반드시 대응하는 Issue(질문/배경)가 존재하는가?"
     - "대안(Alternative) 간의 충돌(conflicts_with) 엣지가 논리적으로 성립하는가?"
     - "미결정 상태인데 결정(Resolved)으로 잘못 표기되지 않았는가?"
   - 검증 실패 시 구체적인 피드백(Critique)을 Optimizer에 반환하여 순환 그래프(Cyclic Loop)를 통해 최대 3회 자가 치유(Self-Correction) 수행.
   - **Primary Source**: Anthropic (2024). *Building Effective Agents* (https://www.anthropic.com/research/building-effective-agents).

### 3.2 상태 머신(State Machine) 기반 그래프 오케스트레이션
1. **LangGraph StateGraph 패턴**:
   - `TypedDict` 또는 Pydantic으로 정의된 불변 상태(State)를 노드 간에 전달.
   - `Send` API를 통한 동적 병렬 처리(Map-Reduce): 대화 스레드별 Extractor 병렬 실행.
   - Conditional Edges(`add_conditional_edges`): Consensus Score 평가 점수($S \ge 0.85$) 충족 여부에 따라 종료 노드(`END`) 또는 보정 노드(`RefineNode`)로 분기.
   - Checkpointing & Time Travel: 복잡한 의사결정 그래프 생성 도중 실패 시 특정 체크포인트 상태로 롤백 가능.
   - **Primary Source**: LangChain Inc. *LangGraph Documentation & Conceptual Guide* (https://langchain-ai.github.io/langgraph/).

2. **LlamaIndex Workflows 패턴**:
   - 이벤트 기반(Event-driven) 상태 머신 아키텍처.
   - `@step` 데코레이터를 통해 `ExtractionEvent`, `ConflictDetectedEvent`, `ConsensusVerifiedEvent` 등 강타입 이벤트 흐름을 선언적으로 결합.

### 3.3 후보 추출 ➔ 상충 검증 ➔ 거버넌스/합의 평가 분업 구조
*   **Extractor Node**:
    - 대화에서 원인과 결과, 선택지를 원자적 단위(Atomic Unit)로 분해.
    - 예: "DB로 PostgreSQL과 DynamoDB를 고민하다가 트랜잭션 보장을 위해 PostgreSQL로 가기로 함" ➔ Issue("DB 선정"), Alternatives(["PostgreSQL", "DynamoDB"]), Decision("PostgreSQL"), Rationale("ACID 트랜잭션 보장").
*   **Conflict Detector Node**:
    - 동일 세션 또는 이전 세션과의 모순 탐지.
    - 예: 회의 전반부에서는 "기능 A를 다음 주에 릴리즈"하기로 했으나 후반부에 "QA 일정 부족으로 기능 A 연기" 합의가 일어난 경우, `supersedes` 또는 `conflicts_with` 엣지를 생성하여 시간적 오버라이드 반영.
*   **Consensus Scorer Node**:
    - 발화자의 권한(Tech Lead, PM 등 메타데이터)과 참여자들의 동의 반응(이모지 `+1`, "동의합니다", "반대합니다" 텍스트)을 분석.
    - 합의도(Consensus Score: 0.0~1.0) 및 결정 상태(`DECIDED`, `TENTATIVE`, `ABANDONED`) 확정.

---

## 4. 도식화 및 다이어그램 생성 핵심 기술 (Visualization & DSL Generation)

### 4.1 의사결정 지식 그래프(Decision Knowledge Graph) 데이터 모델
소프트웨어 설계 이론의 표준인 **IBIS (Issue-Based Information System)** 및 **Design Rationale Language (DRL)**를 현대 그래프 모델로 확장하여 표준 온톨로지를 정의합니다.

```
       [Issue] (의사결정 배경/질문)
          │
          ├─── addresses ───► [Alternative A] ◄─── opposes ─── [Rationale: 고비용]
          │                          ▲
          │                     conflicts_with
          │                          ▼
          └─── addresses ───► [Decision / Alternative B]
                                     │
                                     ├─── supported_by ─── [Rationale: 확장성]
                                     │
                                     └─── triggers ───────► [ActionItem] (담당자/기한)
```

#### Graph Schema Definition (TypeScript / Pydantic 표준)
*   **Entities (Nodes)**:
    - `Issue`: 해결해야 할 문제, 아젠다, 질문
    - `Decision`: 최종 채택된 결정 사항
    - `Alternative`: 검토되었으나 보류/탈락한 대안
    - `Rationale`: 결정을 뒷받침하는 기술적/비즈니스적 근거, 제약사항, 트레이드오프
    - `ActionItem`: 결정에 의해 트리거된 구체적인 실행 과제, 담당자(Assignee), 마감일(Due Date)
*   **Relationships (Edges)**:
    - `addresses`: 대안/결정이 어떤 이슈를 해결하는가
    - `supported_by`: 근거가 결정을 지지함
    - `opposes`: 근거가 대안/결정에 반대함
    - `conflicts_with`: 두 대안이 상호 배타적임
    - `supersedes`: 새로운 결정이 이전의 결정을 덮어씀 (시간적 갱신)
    - `depends_on`: 어떤 결정이 다른 결정의 선행 조건임
    - `triggers`: 결정이 후속 액션 아이템을 유발함

### 4.2 시각화 DSL 및 타겟 포맷 비교

| 구분 | Mermaid.js | Excalidraw Schema | React Flow / XYFlow JSON |
| :--- | :--- | :--- | :--- |
| **형태** | 텍스트 기반 마크다운 DSL | 선언형 JSON Object Schema | 노드/엣지 기반 React ViewState JSON |
| **장점** | 토큰 소모 최소화, LLM 생성 안정성 우수, 깃허브/마크다운 네이티브 지원 | 손그림 느낌의 직관적 UX, 커스텀 도형/색상 자유도, 캔버스 수정 지원 | 인터랙티브 노드(버튼, 확장패널), 드래그 앤 드롭, 엔터프라이즈 UI 완벽 제어 |
| **단점** | 레이아웃 커스텀 제한, 인터랙션(확장/접기) 불가 | LLM이 좌표 계산($x, y, w, h$) 직접 수행 시 왜곡 및 겹침 발생 | 별도 프론트엔드 렌더러와 상태 관리 파이프라인 필수 |
| **적합한 위치** | 문서 자동 삽입, 빠른 프리뷰 | 화이트보드 협업 도구 연동 | 인터랙티브 의사결정 대시보드 |

### 4.3 LLM Structured Output을 통한 무결점 AST/DSL 생성 및 자동 레이아웃 엔진

LLM에게 직접 2차원 좌표값($x, y$)을 계산하도록 시키면 노드 겹침(Collision)과 엣지 꼬임 현상이 필연적으로 발생합니다. 따라서 **위상 수학적 논리 그래프(Topology Graph)와 기하학적 2D 배치(Layout Geometry)를 분리하는 2단계 파이프라인**을 구축해야 합니다.

```
[Clean DKG State]
       │
       ▼
[LLM: OpenAI/Anthropic Structured Outputs] (JSON Schema / Zod 스키마 강제)
       │  ➔ 위상 그래프 (Nodes & Edges List without x,y coordinates)
       ▼
[Graph AST / Logical Model]
       │
       ▼
[Automated Layout Engine] (ELK.js / Dagre)
       │  ➔ 노드 바운딩 박스 크기 측정 후 계층형/방향성 좌표 계산 (x, y, bendPoints)
       ▼
[Physical Graph with Coordinates]
       │
       ├─────────────────────────┬─────────────────────────┐
       ▼                         ▼                         ▼
 [React Flow Canvas]    [Excalidraw Elements]     [Mermaid Flowchart]
```

1. **Structured Outputs (Zod / JSON Schema)**:
   - OpenAI의 `response_format: { type: "json_schema" }` 또는 Anthropic Tool Use를 사용하여 구문 오류가 100% 없는 순수 그래프 AST를 추출합니다.
   - 불필요한 마크다운 백틱 파싱 실패 가능성을 원천 차단합니다.
   - **Primary Source**: OpenAI (2024). *Structured Outputs Official Guide* (https://platform.openai.com/docs/guides/structured-outputs).

2. **자동 레이아웃 엔진 (ELK.js vs Dagre)**:
   - **Dagre**: 가볍고 브라우저 번들 사이즈가 작으나 계층형(Sugiyama) 단일 알고리즘에 의존하며 유지보수가 사실상 중단된 상태입니다.
   - **ELK.js (Eclipse Layout Kernel)**: 
     - 웹 워커(Web Worker)에서 비동기 레이아웃 연산 가능.
     - 노드 간 패딩, 포트(Port) 연결 위치, 계층 레이아웃(`layered`), 엣지 라우팅(`ORTHOGONAL` 직각 라우팅)을 정밀 제어하여 엣지 교차(Crossings)를 최소화.
     - 노드 텍스트 길이에 따라 DOM 측정 또는 사전 계산된 Width/Height를 ELK에 전달하면, 충돌 없는 절대 좌표 $(x, y)$를 산출하여 React Flow나 Excalidraw에 바인딩합니다.
   - **Primary Source**: Kiel University. *ELK.js - Eclipse Layout Kernel for JavaScript* (https://github.com/kieler/elkjs).

---

## 5. 최신 서비스 및 오픈소스 레퍼런스 분석 (Primary Sources)

### 5.1 Napkin AI (napkin.ai)
- **개념**: "Text to Visual Storytelling". 긴 비정형 텍스트를 입력하면 문맥을 이해하여 적합한 인포그래픽, 다이어그램, 순서도를 추천 및 생성.
- **아키텍처 특징**:
  - 자체 Spark 렌더링 엔진을 통해 텍스트 단락의 의미론적 관계(대등, 인과, 계층)를 분류.
  - 정적 이미지가 아닌 벡터 기반의 수정 가능한 개별 객체(Editable Shapes/Connectors)로 다이어그램을 출력.
  - 비즈니스 프레젠테이션 및 스토리텔링에 최적화되어 있으나, 엔지니어링용 다이어그램 코드(DSL) 내보내기는 제한적임.
- **Reference**: Napkin AI Official Documentation & Showcase (https://www.napkin.ai/).

### 5.2 Eraser.io (DiagramGPT & Eraser DSL)
- **개념**: 엔지니어링 조직을 위한 AI 기반 "Diagram-as-Code" 플랫폼.
- **아키텍처 특징**:
  - LLM 친화적인 토큰 절약형 독자 DSL(Eraser Diagram-as-Code Syntax) 설계.
  - LLM이 복잡한 JSON/좌표 대신 간결한 DSL 텍스트를 출력하면, Eraser의 자체 렌더링 엔진이 클라우드/브라우저에서 정밀한 시퀀스 다이어그램, 아키텍처 다이어그램, ERD로 자동 변환.
  - 오픈소스 `eraser-diagrams` 리포지토리를 통해 좌표 인식 다이어그램 렌더링 명세 공개.
  - GitHub Bot 연동 및 CI/CD 문서화 파이프라인 제공.
- **Primary Source**: 
  - Eraser.io Documentation: *Diagram-as-Code Syntax* (https://docs.eraser.io/docs/diagram-as-code).
  - EraserLabs GitHub: *eraser-diagrams* (https://github.com/eraserlabs/eraser-diagrams).

### 5.3 Whimsical AI (whimsical.com)
- **개념**: AI 프롬프트 기반 마인드맵, 플로우차트, 와이어프레임 자동 생성 도구.
- **아키텍처 특징**:
  - 트리 기반 마인드맵 생성 시 노드 간의 발산적 추론(Divergent Thinking)에 특화.
  - 구조화된 계층 노드를 생성하고 드래그 앤 드롭 캔버스에 실시간 실시간 배치.
- **Reference**: Whimsical AI Official Documentation (https://whimsical.com/ai).

### 5.4 LangGraph Decision Graph & LangSmith
- **개념**: 순환 그래프(Cyclic Graph) 기반 멀티 에이전트 오케스트레이션 프레임워크.
- **적용 사례**:
  - 복잡한 다단계 의사결정 파이프라인 구축 시 분기 조건(`conditional_edge`), 오류 감지 루프, 인간 개입(Human-in-the-loop, approval 노드)을 결합한 그래프 워크플로우를 구성하는 업계 표준.
- **Primary Source**: LangChain Inc. *LangGraph Design Patterns* (https://langchain-ai.github.io/langgraph/concepts/agentic_concepts/).

---

## 6. 결론 및 종합 아키텍처 제언 (Production Blueprint)

의사결정 도식화 서비스를 프로덕션 레벨로 구축하기 위한 이상적인 기술 스택 조합은 다음과 같습니다:

1. **전처리 계층**:
   - `Sentence-Transformers` (bge-m3/multilingual-e5) 기반 윈도우 유사도 곡선으로 1차 토픽 경계 분할.
   - Kummerfeld 링크 예측 휴리스틱으로 채널 대화 스레드 트리 복원.
   - DeBERTa 의도 분류기 + 룰 기반 잡담 필터링.
2. **에이전틱 오케스트레이션 계층**:
   - `LangGraph` 기반의 상태 머신 구축.
   - Extractor ➔ Conflict Detector ➔ Consensus Scorer ➔ Evaluator(재생성 루프) 파이프라인.
   - OpenAI/Claude의 Structured Outputs (Zod)를 통해 IBIS 기반 DKG AST 강제 생성.
3. **시각화 및 렌더링 계층**:
   - 위상 지식 그래프 AST를 프론트엔드로 전송.
   - 웹 워커에서 `ELK.js`를 구동하여 직각 엣지 라우팅 및 계층 레이아웃 좌표 자동 계산.
   - `React Flow (XYFlow)`를 통해 노드 접기/펼치기, 근거(Rationale) 툴팁, 상충(Conflict) 하이라이트 기능을 갖춘 인터랙티브 캔버스로 최종 렌더링.
