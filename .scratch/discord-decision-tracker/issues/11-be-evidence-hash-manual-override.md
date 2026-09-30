# 11 — 증거 해시(EvidenceHash) 자동 차단 및 수동 핀(📌) 재분석 오버라이드

**What to build:**
검토 대기열에서 반려(`Rejected`)된 결정 후보의 원본 대화 해시(`EvidenceHash`)는 자동 감지 및 정기 스캔 시 영구적으로 재추출이 차단되도록 보장합니다. 단, 사용자가 명시적으로 📌 핀 리액션을 달거나 수동 `/스캔`을 실행하여 `isManualOverride: true` 플래그가 전달된 경우에 한해 1회성 재분석 및 신규 후보 등록을 허용합니다.

**Blocked by:** 10 — 대화 세션 슬라이싱(30분 공백) 및 4단계 거버넌스 루브릭 채점 엔진

**Status:** ready-for-agent

- [ ] 백엔드 `POST /api/discussions/analyze` 요청 DTO 및 스키마에 `isManualOverride` 불리언 필드 지원
- [ ] `DiscussionService`에서 이미 반려된 `evidenceHash` 조회 시, `isManualOverride === false`이면 분석을 스킵하고 사유를 반환
- [ ] `isManualOverride === true`인 경우 반려 해시 제한을 우회하여 재분석 및 새 결정 후보 등록 수행
- [ ] 수동 오버라이드 및 자동 차단 동작을 검증하는 통합 단위 테스트 작성
