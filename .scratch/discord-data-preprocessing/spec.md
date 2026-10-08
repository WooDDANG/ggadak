# Specification: Discord Data Preprocessing & Decision Extraction Pipeline

- **Feature**: `discord-data-preprocessing`
- **Destination**: 디스코드 비정형 대화 스트림으로부터 잡담을 제거하고 얽힌 맥락(Disentangled Threads)을 복원하여, 토큰 낭비 없는 고품질 의사결정 후보(Decision Candidates)를 백엔드 AI 엔진으로 전달하는 전처리 파이프라인 아키텍처 스펙
- **Status**: Ready for Implementation (Draft Spec finalized from Wayfinder Map)
- **Primary Source References**:
  - `docs/research/ai-agentic-decision-visualization.md` (ACL 2019 Disentanglement & IBIS Graph)
  - `docs/research/korean-consensus-nlp-and-preprocessing-tooling.md` (Aho-Corasick & WASM NLP & Transformers.js ONNX)

---

## 1. 아키텍처 원칙 및 책임 분리 (Architecture & Responsibilities)

### 1.1 기본 원칙
1. **백엔드 중앙 집중 전처리 원칙 (Backend-Centralized)**:
   - 디스코드 봇(`apps/bot`)은 3초 게이트웨이 타임아웃과 웹소켓 안정성을 보장하기 위해 경량 수집 및 전달에만 집중합니다.
   - 무거운 전처리(형태소 분석, 토픽 드리프트 임베딩, 스레드 복원, 거버넌스 평가)는 백엔드(`apps/be`)에서 100% 인프로세스 또는 워커로 전담합니다.
2. **비용 제로 캐스케이드 (Zero-Cost Cascade)**:
   - 전체 수집 대화 중 70~80%에 달하는 잡담과 비결정 대화를 $0.01\text{ms} \sim 2\text{ms}$의 로컬 연산으로 사전 탈락시켜, 유료 LLM API 토큰 비용을 최소화합니다.

---

## 2. 5단계 전처리 파이프라인 명세 (5-Stage Pipeline)

```text
[Discord Channel Event]
         │
         ▼
[Stage 1: Bot Harvesting & Debounce] (apps/bot)
   - 📌 핀: 0초 즉시 수집 / 키워드: 15초 슬라이딩 디바운스
   - 스레드 채널: 전체 최대 100건 / 일반 채널: 앞15, 뒤5 비대칭 윈도우
   - 60초 TTL 인메모리 채널 락 (중복 방지)
         │ HTTP POST /api/discussions/analyze
         ▼
[Stage 2: Tier 1 Zero-Cost Rule Filtering] (apps/be)
   - 봇 발화(author.bot) 및 접두사 커맨드(^[/!?.~-]) 즉시 삭제
   - 링크/미디어는 [Link], [Attachment] 메타 태그로 정규화 보존
   - 합의어("ㅇㅋ", "동의", "👍") ➔ 직전 발화의 가상 리액션(+1)으로 흡수 후 본문 삭제
   - 순수 감탄사("ㅋㅋ", "ㅠㅠ") 삭제
         │
         ▼
[Stage 3: Conversation Disentanglement] (apps/be)
   - 답글(referenceMessageId) & 5분 이내 @멘션 하드 링크 연결
   - 동일 화자 60초 이내 연속 발화(Burst) 단일 노드 병합
   - 2분 이내 활성 스레드 자동 편입 (2분 이상 공백 시 신규 분기)
   - 인과순 정렬 평탄화 배열 (DisentangledThread[]) 변환
         │
         ▼
[Stage 4: Hybrid Session Slicing & Topic Drift] (apps/be)
   - 1차: 30분 침묵 갭(Silence Gap) 물리적 분할
   - 2차: 15개 이상 긴 세션 대상 현대적 TextTiling 적용
     * WASM 형태소 분석기(garu-ko) 실질 형태소 추출
     * 3~5개 발화 블록 임베딩 (Xenova/paraphrase-multilingual-MiniLM-L12-v2 INT8)
     * 코사인 유사도 골짜기 깊이 점수(Depth Score >= 0.35)에서 주제 분할
   - 세션 가드레일: 최소 1개(단독 선언 보존) ~ 최대 100개 메시지
         │
         ▼
[Stage 5: Decision Signal Escalation Gate] (apps/be)
   - 합집합 3중 게이트 판정:
     a) 수동 📌 핀 / 스캔 오버라이드
     b) 메시지 반응 수 >= 3개
     c) 합의/결정 어미(~합시다, ~하기로 함, ~픽스, ~확정) 매칭
   - [미충족 시]: DB 미저장 + 봇 👀 이모지 조용한 회수 (Silent Cleanup, 비용 0원)
   - [충족 시]: Vercel AI SDK (LLM) 호출 ➔ 의사결정 추출 ➔ 사후 거버넌스 스코어 확정
```

---

## 3. 핵심 데이터 모델 및 TypeScript 인터페이스

### 3.1 `DisentangledThread`
```typescript
export interface DisentangledThread {
  threadId: string;
  rootMessageId: string;
  channelId: string;
  messages: PreprocessedMessage[];
  participants: string[];
  durationMs: number;
  syntheticReactions: Record<string, number>; // messageId -> 추가된 동의어 카운트
}

export interface PreprocessedMessage {
  id: string;
  authorId: string;
  authorName: string;
  content: string; // 정규화된 본문 ([Link], [Attachment] 포함)
  createdAt: Date;
  referenceMessageId?: string;
  reactionCount: number;
  isTrigger?: boolean;
}
```

### 3.2 토픽 드리프트 블록 임베딩 (`TopicBlock`)
```typescript
export interface TopicBlock {
  blockIndex: number;
  messageIds: string[];
  aggregatedText: string;
  embedding?: number[]; // 384차원 Dense Vector
}
```

---

## 4. 라이브러리 및 도구 스택

| 컴포넌트 | 추천 패키지 / 기술 | 역할 및 성능 |
| :--- | :--- | :--- |
| **자모 정규화** | `es-hangul` | Toss 오픈소스, 초성/자모 분해, Latency < 0.001ms |
| **고속 사전 매칭** | `modern-ahocorasick` | O(N) 다중 패턴 탐색, Latency < 0.01ms |
| **형태소 분석** | `garu-ko` (또는 Kiwi WASM) | WebAssembly 기반 초경량(1.2MB), 종결어미 분석, Latency < 2ms |
| **로컬 임베딩** | `@xenova/transformers` | ONNX 런타임 INT8 다국어 모델 (120MB), 외부 비용 0원 |
| **백엔드 AI 엔진** | Vercel AI SDK (`ai`) | Gemini / OpenAI 구조화 다중 의사결정 추출 (`DecisionItemDto[]`) |

---

## 5. 단계별 구현 마일스톤 (Next Milestones)

- [ ] **M1 (apps/bot)**: 수집 윈도우(스레드 100건/일반 앞15,뒤5), 핀 0초/키워드 15초 디바운스, 60초 락 TTL 적용
- [ ] **M2 (apps/be 전처리 1단계)**: `es-hangul` + `modern-ahocorasick` 기반 Tier 1 잡담 제거 및 가상 리액션 변환 로직 탑재
- [ ] **M3 (apps/be 전처리 2단계)**: `DisentangledThread` 답글/멘션 트리 복원 및 인과순 평탄화 파이프라인 구현
- [ ] **M4 (apps/be 전처리 3단계)**: `garu-ko` 형태소 + Transformers.js 블록 임베딩 TextTiling(0.35 깊이) 토픽 분할기 탑재
- [ ] **M5 (apps/be 게이트웨이)**: 합집합 3중 게이트 및 미충족 시 봇 이모지 조용한 회수(Silent Cleanup) 연동
