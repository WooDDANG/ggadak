Type: grilling
Status: resolved
Blocked by: 01

## Question

스레드를 생성하지 않고 단일 채널에서 여러 화자가 2개 이상의 주제를 교차 발화할 때, 대화 얽힘(Conversation Disentanglement)을 해소할 데이터 구조와 연결 알고리즘은 무엇인가?
- 디스코드의 원어민 기능인 답글(Reply-to/referenceMessageId)과 @멘션 기반 1차 방향성 트리(Directed Forest) 구성 방식
- 답글이 없는 평문 연속 발화 간의 동일 화자/인접 시간대 클러스터링 휴리스틱
- 백엔드 데이터 모델: `DisentangledThread` 엔티티 정의 및 메시지 배열 구조화

## Answer

1. **명시적 하드 링크 우선 (Hard-Link First)**:
   - `referenceMessageId`(답글)가 존재하면 해당 부모 메시지의 직계 자식 노드로 연결하여 1차 방향성 트리(Directed Forest) 구축.
   - 특정 유저 `@멘션`이 포함되어 있고, 해당 유저가 직전 5분 이내에 발화한 이력이 있다면 가상 인과 링크로 연결.
2. **고아(Orphan) 메시지 편입 휴리스틱**:
   - **동일 화자 버스트 병합**: 동일 화자가 60초 이내에 연달아 발화한 메시지는 단일 발화 노드로 병합(Burst Utterance Merge).
   - **2분 활성 스레드 귀속**: 직전 2분 이내에 상호작용이 있었던 활성 스레드로 후속 발화 편입.
   - **신규 스레드 분기**: 2분 이상의 침묵 이후 새롭게 시작된 발화는 새로운 대화 스레드 루트로 분기.
3. **인과순 정렬 평탄화 배열 모델 (`DisentangledThread`)**:
   - 트리 계층을 순회하여 원본 시간순이 아닌 인과관계 순으로 정렬된 평탄화 메시지 리스트로 변환.
   - `DisentangledThread { threadId: string, rootMessageId: string, messages: RawMessageData[], participants: string[], durationMs: number }` 모델을 통해 LLM에게 잡음 없이 격리된 대화 스크립트 제공.
