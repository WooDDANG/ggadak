# 01: 선택 서버의 봇 설치 상태와 설치 링크 API

Status: resolved
Type: task
Owner: agy (Herdr worker)
Execution: done
Blocked by: none

Spec: [spec.md](../spec.md)

## Acceptance criteria

- [x] `GET /api/v1/discord/bot-status?guildId=...` provides the agreed v1 response.
- [x] Authenticated guild access is checked first; 401/403 are preserved.
- [x] Installed, confirmed absence, and unknown are distinguished without treating channel errors as absence.
- [x] Only eligible managers receive a valid selected-guild installation URL for confirmed absence.
- [x] Responses are no-store observations with timestamps; existing data access remains independent.
- [x] Adapter/service/HTTP TDD and relevant type checks pass.

## Comments

Implementation began from the agreed spec before ticket files were split. This
ticket records the existing assignment rather than dispatching duplicate work.
Coordination records belong to Codex; implementation file ownership is in map.md.

Validation: see [verification.md](../verification.md). Implementation, generation,
contract alignment, type checks, targeted lint, and all 244 repository tests passed.
