# 02: 빈 결정과 모순된 분석 결과의 정상 완료 차단

**What to build:** AI가 빈 결정이나 모순된 후보 목록을 반환하면 잘못된 Draft를 저장하거나 분석을 정상 완료하지 않는다.

**Blocked by:** None (can start immediately).

**Status:** needs-triage

- [ ] Topic, Decision, Rationale의 빈 문자열과 공백만 있는 값은 저장 전에 거절한다. 도메인 검증은 Service에 두고 Repository에 Zod를 되돌리지 않는다.
- [ ] 후보 목록 누락과 found/list 불일치는 잘못된 응답으로 판정한다. 명시적 no-decision 응답은 정상 완료한다.
- [ ] 주입한 잘못된 공급자 응답을 실제 분석 API와 임시 DB 경계에서 검증하고 Decision Candidate가 저장되지 않음을 확인한다.
- [ ] 여러 세션 중 하나가 잘못된 결과를 반환하면 후보 저장과 요청 완료를 원자적으로 취소한다. 같은 Analysis Request의 복구가 일관되게 동작한다.
- [ ] 정상 후보, 정상 no-decision, exact reuse와 manual reanalysis의 기존 계약은 유지한다.
- [ ] AI 응답 정규화·도메인 검증을 테스트용 어댑터로 우회하지 않고 Service 경계에서도 적용한다. FE 변경은 없다.
