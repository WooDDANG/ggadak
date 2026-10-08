Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Tier 2 단계에서 시간 간격(Silence Gap)과 의미적 토픽 전환(Topic Drift)을 감지하여 대화 세션을 분할(Session Slicing)하는 하이브리드 기준은 무엇인가?
- 고정 시간 간격(예: 30분 무발화 시 세션 분할)의 유효성과 한계
- 로컬 경량 임베딩 모델(예: Xenova/all-MiniLM-L6-v2 등 transformers.js)을 활용한 TextTiling 코사인 유사도 골짜기(Depth score) 감지 적용 여부
- 분할된 세션의 최소/최대 길이 임계값(Min/Max Window Token Limit)

## Answer

1. **30분 침묵 갭 유지 (1차 물리적 분할)**:
   - 30분 이상 대화 침묵 발생 시 이전 주제와 분리된 새로운 세션으로 1차 분할.
2. **하이브리드 TextTiling 및 로컬 유사도 2차 분할**:
   - 30분 이내에 이어진 긴 대화에서 급격한 주제 전환(Topic Drift)이 발생할 경우, 로컬 경량 임베딩 코사인 유사도 골짜기(Depth score)를 기반으로 2차 분할.
   - 단, 로컬 유사도 구현 세부 기준(Transformers.js ONNX 모델, 코사인 임계값)은 연계 티켓(`06-local-embedding-and-similarity-implementation`)으로 명세화.
3. **최신 LLM 특성을 반영한 세션 가드레일 (최소 1개, 최대 100개 메시지)**:
   - **최소 1개**: "DB는 PostgreSQL로 픽스합니다"와 같은 단독 선언/공지형 의사결정도 누락 없이 감지하도록 하한선 완화.
   - **최대 100개**: 최신 프론티어 LLM의 긴 컨텍스트 윈도우와 니들 인 어 헤이스택(Needle-in-a-haystack) 탐색 성능을 신뢰하여, 과도한 조기 분할 없이 넓은 맥락(최대 100건)을 AI가 종합적으로 파악하도록 허용.
