# 02: AI 실패 분류를 오류 코드로 확정

**What to build:** 실패를 던지는 쪽이 실패 코드를 직접 지정하게 해서, 메시지 문구가 바뀌어도 분류와 재시도 판정이 바뀌지 않게 한다. 메시지 정규식은 외부 provider가 돌려준 오류에만 쓴다.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

스캔 안의 세션 건너뜀 뒤 자동 재시도(ADR-0028)와 Analysis Queue의 요청 재시도(ADR-0023)는 별개다.

| 코드 | 스캔 안 | 스캔 밖 | 큐 전체 정지 |
|---|---|---|---|
| `output-empty`, `output-unparseable`, `verify-format`, `graph-structure`, `semantic-verification`, `budget-exhausted` | 세션 건너뜀, 1분·5분 자동 재시도 | 422 종료 | 안 함 |
| `output-truncated` | 세션 건너뜀, 수동 재분석만 | 422 종료 | 안 함 |
| `timeout` | 세션 건너뜀, 1분·5분 자동 재시도 | 큐 요청 재시도 | 안 함 |
| `rate-limit`(키 하나), `auth`(키 하나) | 다른 키로 큐 요청 재시도 | 같음 | 안 함 |
| `provider`(5xx) | 큐 요청 재시도 | 같음 | 함 |
| `auth`(모든 키 401 또는 403 대기) | 큐 정지 후 원인 표시 | 종료 | 함 |
| `configuration` | 종료 | 종료 | 안 함 |
| `lease-lost` | 시도로 세지 않고 다시 잡음 | 같음 | 안 함 |

- [ ] 스트림의 `finish_reason`을 읽어 출력 상한에서 잘린 응답을 `output-truncated`로 구분한다. "NVIDIA AI output exceeds application token limit"도 이 코드로 보낸다(현재는 `configuration`으로 오분류돼 `ai-metrics-logger.ts:73-76`에서 지표가 빠진다).
- [ ] 빈 응답은 `output-empty`, JSON 파싱 실패는 `output-unparseable`, Verify 스키마 위반은 `verify-format`으로 던진다. 지금처럼 `graph-structure`·`semantic-verification`에 섞지 않는다.
- [ ] AI 슬롯·요청 임대 상실로 인한 abort를 `lease-lost`로 구분한다. NVIDIA 어댑터가 모든 abort를 "timed out"으로 바꾸는 동작(`nvidia-provider.ts:231-240`)과 `graph-workflow.ts:234`의 "AI call timeout" 기록을 고친다.
- [ ] `safeAiErrorCode`의 메시지 전체 일치 조회를 코드 조회로 바꾼다.
- [ ] 각 코드의 분류와 재시도 판정을 단위 테스트한다.

`degraded-analysis-recovery/02`, `03`이 이 코드로 건너뜀과 자동 재시도를 판정한다.

## Comments

**2026-11-19 구현:** 코드를 먼저 고친 뒤 테스트를 썼고, 고치기 전 코드로 되돌려 테스트가 실패하는 것을 확인했다. BE 테스트 248건, Bot 테스트 55건과 타입 검사가 통과했다. 구현 후 내린 결정은 `../spec.md`의 '결정 기록'에 있다.
