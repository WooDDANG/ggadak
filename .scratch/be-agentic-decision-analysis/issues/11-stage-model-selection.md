# 11: 분석 단계별 모델 선택과 재개 시 설정 보존

**Status:** resolved

사용자 요청: 에이전틱 서비스에서 상황에 맞게 모델을 교체할 수 있어야 한다. 우선 추출/검증/수정 단계별 명시적 설정을 지원한다. 복잡도 자동 추론이나 비싼 모델로 자동 승격은 포함하지 않는다.

- AI_MODEL을 기본값으로 두고 AI_MODEL_EXTRACT/VERIFY/REPAIR를 선택적으로 설정한다. 현재 provider 안에서 모델을 바꾸며 CLI는 agy models의 slug를 사용한다.
- AiAdapter에서 선택하고 기존 extractGraph/verifyGraph/repairGraph interface를 유지한다. 재검증은 verify 모델을 사용한다. 미설정/기존 workflow는 기본 model을 유지한다.
- 모델 규칙을 분석 시작 시 깊은 복사하여 저장한다. 설정 변경이나 재시작은 진행 중인 workflow를 바꾸지 않는다. 단계 attempt에 실제 선택한 provider/model을 기록한다.
- 비교 평가의 --model은 모든 단계와 baseline에 동일 모델을 적용하여 서비스 환경의 override가 섞이지 않게 한다.
- 역할별 선택/누락 fallback/기존 기록/재시작/진행 중 변경을 검증한다. 실제 CLI로 서로 다른 두 모델을 선택해 검증한다.

## Answer

2026-10-15: optional stageModels를 저장 설정에 추가하고 공통 modelForStage 선택을 transport와 attempt 기록에서 사용한다. 시작 시 settings를 깊은 복사해 진행 중 mutation을 차단한다. 평가 runner는 --model로 전체 비교를 고정한다. 기본 모델 및 운영 역할 override는 변경하지 않았다.

회귀 테스트에서 기존 단일 모델 동작을 먼저 실패시킨 뒤 역할별 선택/미설정/legacy/baseline을 검증했다. 임시 DB에서 추출 중 설정 mutation 후 검증 실패, Prisma 재시작과 다른 기본값으로 재개하는 경우에도 처음 저장한 critic 모델이 사용됨을 확인했다.

실제 agy는 gemini-3.8-flash-low로 추출하고 gemini-3.8-flash-medium으로 검증해 completed: PostgreSQL agreed, 2회/no repair/약 36.2초, aggregate input=24655/output=1420. 임시 DB만 사용했고 보고서는 ignored `.data/evaluation/stage-model-live-2026-10-15.json`이다.

전체 npm test(BE 108/E2E 6 포함), typecheck, lint(기존 logger 경고 1개), 변경 파일 Prettier, Standards/Spec 리뷰 통과. 자동 복잡도 판단/승격, provider 간 자동 fallback은 추가하지 않았다.
