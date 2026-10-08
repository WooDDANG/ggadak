## Destination

디스코드 비정형 대화 스트림으로부터 잡담을 제거하고 얽힌 맥락(Disentangled Threads)을 복원하여, 토큰 낭비 없는 고품질 의사결정 후보(Decision Candidates)를 백엔드 AI 엔진으로 전달하는 데이터 전처리 파이프라인 아키텍처 스펙([spec.md](./spec.md)) 확립 완료.

## Notes

- Domain: Discord Governance, Conversation Disentanglement, TextTiling, 3-Tier Cascade Filtering
- Skills to consult: `/domain-modeling`, `/grilling`, `/prototype`
- Reference: `docs/research/ai-agentic-decision-visualization.md` (Primary Sources 연구 보고서)
- Scope boundary: 백엔드 중앙 집중 전처리 원칙 (`apps/be`가 단일 진실 공급원)

## Decisions so far

- [[01-harvesting-window-and-rate-control](./decisions/01-harvesting-window-and-rate-control.md)] — 스레드(전체 100건)와 일반 채널(앞15/뒤5 비대칭 윈도우) 차등 수집, 핀 0초/키워드 15초 슬라이딩 디바운스, 60초 TTL 인메모리 채널 락 확립
- [[02-tier1-rule-based-filtering-rules](./decisions/02-tier1-rule-based-filtering-rules.md)] — 봇/커맨드 완전 제외, 링크/미디어 메타 태그 정규화 보존, 합의어 가상 리액션 흡수 및 순수 잡담 감탄사 삭제 확립
- [[03-conversation-disentanglement-data-model](./decisions/03-conversation-disentanglement-data-model.md)] — 답글/멘션 1차 트리 하드링크, 동일 화자 60초 병합 및 2분 활성 스레드 편입, DisentangledThread 인과순 평탄화 모델 확립
- [[04-tier2-topic-drift-and-session-slicing](./decisions/04-tier2-topic-drift-and-session-slicing.md)] — 30분 침묵 갭 1차 분할, 장문 대상 하이브리드 TextTiling 로컬 유사도 2차 분할, 최신 LLM 대응 최소 1개~최대 100개 세션 가드레일 확립
- [[05-decision-signal-detection-and-escalation](./decisions/05-decision-signal-detection-and-escalation.md)] — 합집합 3중 게이트(핀/리액션>=3/어미매칭) 승격, 1인 독백 액션 보존형 사후 스코어링, 승격 실패 세션 무저장 및 봇 이모지 조용한 회수 확립
- [[06-local-embedding-and-similarity-implementation](./decisions/06-local-embedding-and-similarity-implementation.md)] — 형태소 정제 + 3~5개 슬라이딩 블록 임베딩 결합 TextTiling, Transformers.js ONNX(120MB) 탑재, 깊이 점수 0.35 토픽 분할 확립

## Not yet specified

<!-- see "Fog of war": in-scope fog you can't ticket yet; graduates as the frontier advances -->

- AI 프롬프트 입력용 정규화 포맷 (IBIS Issue-Decision 구조화 직렬화 방식)
- 과거 거절된 결정(Evidence Hash)과의 매칭 및 전처리 레벨 캐싱
- 한국어/영어 혼용 및 특수 은어(픽스, ㄱㄱ 등) 처리용 형태소 정규화 세부 규칙

## Out of scope

<!-- see "Out of scope": work ruled beyond the destination; closed, never graduates -->

- 디스코드 음성 채널(Voice/STT) 음성 인식 데이터 전처리
- 슬랙(Slack), 텔레그램(Telegram) 등 타 플랫폼 어댑터 전처리
- 온디바이스 로컬 소형 언어모델(SLM) 자체 파인튜닝
