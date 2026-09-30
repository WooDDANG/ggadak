# 12 — 의사결정 대체(Supersede) 및 피봇(Pivot) 상태 전이 & 액션 아이템 이관 처리

**What to build:**
검토 대기열에서 결정 후보 승인 시 다른 결정을 대체(`supersedesId`)하거나 피봇(`isPivot: true`)할 때, 기존 결정의 상태를 `Superseded`로 정식 전이하고 미완료 액션 아이템을 안전하게 취소하거나 신규 결정으로 이관할 수 있는 상태 전이 로직을 완성합니다. 또한 프론트엔드 대시보드와 타임라인에 거버넌스 점수 뱃지와 대체 링크 체인을 시각화합니다.

**Blocked by:** 10 — 대화 세션 슬라이싱(30분 공백) 및 4단계 거버넌스 루브릭 채점 엔진

**Status:** ready-for-agent

- [ ] `DecisionService.reviewDecision()`에서 `supersedesId` 제공 시 대상 결정 상태를 `Superseded`로 원자적 트랜잭션 전이
- [ ] 대체된 과거 결정의 미완료 액션 아이템을 취소 처리하거나 새 결정으로 승계하는 로직 처리
- [ ] 프론트엔드 `ReviewQueue` 및 `DecisionTimeline` 카드에 거버넌스 점수 뱃지(4.0 강한 합의, 1.0 주의 등) 및 대체 체인 렌더링
- [ ] 피봇 및 대체 상태 전이의 무결성을 검증하는 단위 테스트 작성
