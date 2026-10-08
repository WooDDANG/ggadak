Type: research
Status: resolved
Blocked by: 04

## Question

Node.js/TypeScript 환경에서 외부 API 비용 0원으로 대화 토픽 드리프트 감지용 로컬 임베딩 및 코사인 유사도를 구현하기 위한 세부 기준은 무엇인가?
- `@xenova/transformers` (Transformers.js) ONNX 런타임 모델 선정 (경량 모델 vs 한국어 다국어 임베딩) 및 번들/메모리 트레이드오프
- 대화 텍스트 블록 단위 벡터화 파이프라인 및 코사인 유사도 연산 성능
- TextTiling 깊이 점수(Depth Score) 기반 세션 절단 임계값(Threshold) 수치 기준

## Answer

1. **형태소 전처리 + 슬라이딩 블록 임베딩 하이브리드 파이프라인 (TextTiling 개조판)**:
   - **형태소 정제**: WASM 형태소 분석기(`garu-ko`/Kiwi)로 조사, 무의미한 감탄사를 제거하고 실질 의미 형태소(체언/용언 어간) 중심으로 문장을 사전 정규화.
   - **블록 묶음(Window Aggregation)**: 디스코드 단문의 어휘 희소성(Sparsity)을 극복하기 위해 발화 3~5개를 하나의 '의미 블록(Block)'으로 그룹핑하여 벡터화.
2. **로컬 임베딩 모델 및 ONNX 런타임**:
   - `@xenova/transformers`의 `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (INT8 양자화, 약 120MB) 탑재.
   - 외부 API 비용 0원, 서버 내부 CPU/네이티브 메모리(약 250MB) 인프로세스 구동.
   - 메시지 수가 15개 미만인 가벼운 대화는 임베딩 연산을 생략하여 서버 부하 방지.
3. **토픽 드리프트(주제 전환) 분할 임계값**:
   - 연속된 블록 간 코사인 유사도 측정 후, 골짜기 깊이 점수(Depth Score = $(S_{prev} - S_{curr}) + (S_{next} - S_{curr})$)가 **0.35 이상**인 지점을 주제 전환 경계선으로 판정하여 세션 분할.
   - 이를 통해 30분 침묵 공백이 없는 연속 발화 중에도 "안건 A"에서 "안건 B"로 전환되는 주제 혼동을 효과적으로 방지.
