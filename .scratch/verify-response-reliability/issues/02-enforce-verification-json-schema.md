# 02: 검증 응답에 JSON Schema 출력 제약 적용

**What to build:** NVIDIA Verify 호출에서 필수 필드와 타입을 명시한 JSON Schema 출력 제약을 사용해, 올바른 검증 결과가 정상 처리되고 잘못된 응답은 명확히 실패하도록 한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Verify 요청은 실제 검증 계약에 맞는 필수 필드와 타입을 JSON Schema 출력 제약으로 전달한다.
- [ ] JSON Schema 출력 제약의 지원 여부가 다른 모델·엔드포인트에서도 선택 가능한 설정으로 제어되며, 미지원 시 동작과 실패가 명확하다.
- [ ] 스트리밍, 토큰 사용량과 TTFT 집계, timeout 및 기존 키 풀 오류 처리 계약을 유지한다.
- [ ] 정상 응답과 필수 필드 누락·잘못된 타입·미지원 엔드포인트 응답을 자동 테스트로 검증한다.
- [ ] 실제 NVIDIA 엔드포인트 검증은 인증 가능한 환경에서 수행하고 미실행 시 결과에 명시한다.
