# 05: Verify에 Extract와 다른 모델을 쓸지 비교

**What to build:** `AI_MODEL_VERIFY`를 Extract와 다른 모델로 둘 때 검증 품질과 비용이 어떻게 바뀌는지 측정해, 기본 구성을 정할 근거를 만든다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] `npm run ai:evaluate`로 같은 모델 구성과 다른 모델 구성을 같은 평가 세트에서 비교한다.
- [ ] 누락 탐지, 지어낸 근거 탐지, 호출 지연, 토큰 비용을 기록한다.
- [ ] 결과로 기본 구성을 정하고, 바꾼다면 `.env.example`과 ADR-0025에 반영한다.

**2026-11-19 Verify 프롬프트 측정:** 같은 모델(`nemotron-3.5-super-vl-120b-a12b`)이 Verify에서 과하게 실패하던 원인은 모델보다 프롬프트였다. 이전 Verify 프롬프트는 생성 규칙 전체를 물려받아, 서버가 코드로 이미 검증한 구조 규칙을 다시 검사하며 있는 관계를 없다고 하거나 없는 규칙을 만들었다(3줄 테스트 대화에서 문제 7~34개). 의미 오류만 보는 agentic-5 Verify로 바꾼 뒤 테스트 대화와 실제 Discord 세션 5개 모두 오탐 0건이었고, 일부러 넣은 오류(원문에 없는 근거, 잘못된 담당자)는 2개 모두 잡았다. 모델 분리 비교는 이 프롬프트를 기준으로 다시 잰다. 평가 입력은 `apps/be/scripts/export-discord-eval-set.mjs`로 만든 `.data/eval/` 아래 로컬 파일이다(공개 저장소라 커밋하지 않는다).
