# 04: API 문서 진입점·대상별 계약 정리와 agy 검토

Status: ready-for-agent
Type: task
Owner: Codex (writing), agy (read-only review)
Execution: review
Blocked by: 01, 02, 03

The user requested organization of API-related docs, then explicitly requested
agy verification after Codex writes them. Source/Swagger behavior is unchanged.

## Acceptance criteria

- [x] Add an API documentation entry point with reading order and current/draft boundaries.
- [x] Separate FE contracts from the complete Bot/service and legacy API inventory.
- [x] Correct obsolete auth, installation, failure-recovery and error descriptions.
- [x] Validate local links/anchors and all Swagger user/service/legacy operations in Herdr verify.
- [ ] Obtain agy review against Swagger and BE sources; resolve findings.

## Comments

Codex validation passed: six API docs, 26 user operations, 16 service operations,
three legacy operations, local links/anchors and matching Swagger hashes.
The earlier agy review was recorded as running; its completion result has not been confirmed in this session. Preserve the user's
untracked docs/ai-agentic-architecture.md.

2026-11-03 문서 정리: 최신 token-only 갱신·이벤트 권한 오류·서비스 인증 Feedback·Gateway 내부 API를 반영했다. Swagger 해시와 service 목록은 현재 생성 스펙으로 갱신했다. agy 리뷰 완료 항목은 증거 없이 체크하지 않는다.
