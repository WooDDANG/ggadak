# 05: Verify에 Extract와 다른 모델을 쓸지 비교

**What to build:** `AI_MODEL_VERIFY`를 Extract와 다른 모델로 둘 때 검증 품질과 비용이 어떻게 바뀌는지 측정해, 기본 구성을 정할 근거를 만든다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-human

- [ ] `npm run ai:evaluate`로 같은 모델 구성과 다른 모델 구성을 같은 평가 세트에서 비교한다.
- [ ] 누락 탐지, 지어낸 근거 탐지, 호출 지연, 토큰 비용을 기록한다.
- [ ] 결과로 기본 구성을 정하고, 바꾼다면 `.env.example`과 ADR-0025에 반영한다.
