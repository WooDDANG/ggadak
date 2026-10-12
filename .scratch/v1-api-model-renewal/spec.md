# 화면 기반 v1 API·모델·ERD 개편

## 기준

2026-10-12 대화와 Obsidian의 「까닭 API 리스트업」을 기준으로 한다. 문서의 완료 표시는 명세 작성 완료이며 구현 완료를 의미하지 않는다.

원본: /Users/wooddang-mac/Documents/WooDDANG_Obsidian_light_2026-2/PARA/WORKSTATION/11. Circle/멋쟁이사자처럼/까닭 API 리스트업.md

## 설계 방향

- SQLite + Prisma, TSOA 기반 OpenAPI와 Orval 클라이언트 생성 체계를 유지한다.
- 기존 API를 유지하며 v1을 확장하고 기능별로 호출자를 전환한 뒤 임시 호환 구조를 제거한다.
- 검수 큐는 결정 엔티티의 상태로 구분한다. 기존 문자열 ID, Superseded 이력, 버전 검증과 Action Item 처리를 보존한다.
- 모델·ERD·마이그레이션·API·화면·검증은 기능별 티켓에서 함께 변경한다.
- DB 삭제나 초기화 대신 사본에서 데이터 보존 마이그레이션을 검증한다. 운영 DB 변경은 별도 승인 대상이다.
- 원본의 숫자 ID, 카테고리 예시, 서버 범위 누락 및 편집 status는 기존 기능과 충돌하지 않도록 해당 티켓에서 계약을 명확히 한다.

## 티켓

- [01: BE 미사용 코드와 중복 구현 정리](issues/01-be-cleanup.md)
- [02: v1 API 호환 기반 확장](issues/02-v1-api-expansion.md)
- [03: AI 공급자 설정과 실패·재시도 처리 정상화](issues/03-ai-failure-recovery.md)
- [04: Discord 로그인과 서버 접근 권한](issues/04-discord-auth-access.md)
- [05: Discord 채널 모니터링 설정](issues/05-channel-monitoring.md)
- [06: 결정 모델 이전과 목록·상세 조회](issues/06-decision-read-migration.md)
- [07: Review Queue 검수 흐름 전환](issues/07-review-queue.md)
- [08: 결정 카드 편집](issues/08-decision-edit.md)
- [09: 수동 Discord 동기화](issues/09-manual-sync.md)
- [10: 대시보드 요약](issues/10-dashboard-summary.md)
- [11: Why 자연어 검색](issues/11-why-search.md)
- [12: Decision Timeline](issues/12-decision-timeline.md)
- [13: 기존 API·클라이언트 전환 완료 및 제거](issues/13-legacy-api-retirement.md)

## 착수

01부터 시작한다. 이후 선행 티켓이 완료된 항목을 진행하며, 번호 순서만으로 불필요한 의존성을 만들지 않는다. 03은 02와 독립적으로 진행 가능하고, 08·11·12는 각각 06 완료 후 착수 가능하다.

