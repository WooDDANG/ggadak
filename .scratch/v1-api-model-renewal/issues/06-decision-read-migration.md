# 06: 결정 모델 이전과 목록·상세 조회

**What to build:** 기존 결정과 근거·이력을 보존한 새 모델에서 카드 목록 필터·페이징 및 상세 조회를 제공한다.

**Blocked by:** 04: Discord 로그인과 서버 접근 권한

**Status:** ready-for-agent

- [ ] Decision Candidate와 Decision Record를 하나의 결정 엔티티의 상태로 구분하고 기존 상태를 IN_REVIEW, CONFIRMED, ON_HOLD, DISCARDED에 매핑한다. Superseded의 별도 이력 표현도 계약에 명시해 보존한다.
- [ ] 기존 문자열 ID, 출처, 근거, 대안, 후속 작업, 버전과 결정 교체 관계를 보존한다. category 및 날짜 형식을 계약에 명시한다.
- [ ] domainJson과 컬럼의 기준 데이터·호환 읽기 정책을 정하고 Prisma 모델·ERD를 갱신한다. 기존 데이터 사본에서 마이그레이션과 전후 데이터 비교를 검증한다.
- [ ] DB에서 서버 범위·필터·정렬·페이징을 적용하고 생성 클라이언트로 목록·상세 화면을 연결한다.
- [ ] 운영 DB의 삭제·초기화 없이 사본에서 재시작 후 조회와 데이터 보존을 검증한다.

