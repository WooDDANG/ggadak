# 02: 미사용·쓰기 전용 메타데이터 정리

**What to build:** 사용되지 않는 보관 시각, 중복 분석 설정, 고정 거절 사유 저장을 줄이면서 결정 조회·실행 복구·거절 근거 중복 방지를 유지한다.

**Blocked by:** None (can start immediately).

**Status:** needs-triage

- [ ] Decision archivedAt, AnalysisRequest configJson, RejectedEvidenceHash reason의 읽기·쓰기·이관 사용처를 확인하고 불필요한 의존성을 제거한다.
- [ ] 분석 설정은 workflow의 저장된 설정을 기준으로 복구하며 기존 분석의 모델·프롬프트 버전을 보존한다.
- [ ] 삭제 대상에 의미 있는 과거 값이 존재하면 손실 없이 보존·이관한 뒤 제거한다. 로컬 DB의 NULL/고정값 분포를 다른 DB에 가정하지 않는다.
- [ ] 정리 마이그레이션 후 조회·재시작 복구·거절된 근거의 재생성 차단이 그대로 동작한다.
- [ ] 마이그레이션 검증에 대상 컬럼을 위치 기준으로 나열하는 레거시 fixture도 포함하고, 자동 테스트는 격리 DB를 사용한다.
