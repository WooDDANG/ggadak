# 04: NVIDIA AI Call JSON 안정화 (temperature 하향 및 구조화 출력 설정)

**What to build:** NVIDIA 프로바이더가 Decision Graph 추출·검증·복구 AI Call을 실행할 때 과도한 무작위성으로 인한 enum 오탈자와 스키마 이탈을 줄이도록 낮은 temperature와 지원 가능한 JSON 출력 제약을 적용한다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] NVIDIA 그래프 AI Call의 기본 temperature를 스키마 준수에 적합한 낮은 값으로 조정하고 설정 변경 가능 여부를 일관되게 유지한다.
- [ ] 지원되는 JSON 출력 형식 제약(response_format 등)을 적용하고 기존 스트리밍·토큰 사용량·TTFT 집계를 유지한다.
- [ ] ADR-0025에 따라 어댑터 내부의 숨겨진 재시도나 타 프로바이더로의 암묵적 폴백 없이, 스키마 위반 처리를 도메인 워크플로에 위임하는 경계를 지킨다.
- [ ] 어댑터 테스트에서 요청 파라미터 전달, JSON 파싱, 타임아웃·키 풀 실패 분류가 모두 정상 동작함을 검증한다.
