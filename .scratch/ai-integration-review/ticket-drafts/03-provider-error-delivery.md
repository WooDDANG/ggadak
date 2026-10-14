# 03: 공급자 오류에 맞는 재시도와 retained failure 처리

**What to build:** OpenAI와 Gemini에서 같은 종류의 오류가 나면 Bot의 Analysis Request도 같은 재시도 또는 retained failure 상태로 남는다.

**Blocked by:** 01: OpenAI 공급자 경로를 독립적으로 검증 가능하게 만들기.

**Status:** needs-triage

- [ ] OpenAI SDK의 JSON 파싱·타입 검증 오류와 Gemini의 대응 오류를 intervention이 필요한 실패로 일관되게 분류한다.
- [ ] 인증·모델·설정 오류는 자동 재시도로 소진하지 않고 보존하며, 429·5xx·네트워크 장애·deadline은 기존 bounded retry 정책을 따른다.
- [ ] 공급자 HTTP fixture를 실제 AiAdapter·분석 API·Bot 전달 경계에 연결해 HTTP 오류, payload 오류와 queue 상태를 검증한다.
- [ ] 일시 실패 후 성공, 영구 실패, 재시작과 명시적 manual retry에서 Analysis Request ID와 후보 중복 방지 규칙을 유지한다.
- [ ] 실패가 no-decision 성공이나 heuristic Decision Candidate로 바뀌지 않으며 스캔 완료와 Channel Checkpoint를 잘못 전진시키지 않는다.
- [ ] 로그는 공급자·모델·오류 분류를 구분하되 키와 원문을 불필요하게 노출하지 않는다. FE는 변경하지 않는다.
