# 12: Decision Timeline

**What to build:** 확정된 결정을 시간 그룹으로 탐색하고 상세 카드로 이동한다.

**Blocked by:** 06: 결정 모델 이전과 목록·상세 조회

**Status:** resolved

- [x] 타임라인 API와 생성 클라이언트·화면을 연결하고 month를 포함한 지원 groupBy를 명시한다.
- [x] 확정 시각 기준의 시간대·그룹·정렬·건수를 일관되게 적용하고 서버 범위 DB 조회를 사용한다.
- [x] 확정 날짜가 없는 기존 데이터의 처리 정책을 명시하며 날짜나 근거를 임의로 만들어 넣지 않는다.
- [x] 빈 결과·월 경계·서버 권한과 기존 결정 교체 이력 보존을 검증한다.

## Answer

Implemented the authenticated `GET /api/v1/decisions/timeline` endpoint with `month` (default), `topic`, `channel`, and `category` grouping; IANA timezone grouping; optional inclusive `from`/exclusive `to` range; deterministic confirmation-time and ID sorting; and guild/lifecycle/date filtering in SQLite. Added nullable indexed `Decision.confirmedAt` projection and additive migration. Undated records remain null and are excluded from timeline results without inference; superseded records retain their historical confirmation date and replacement links but are excluded by lifecycle. The generated Orval client drives the browser-timezone timeline view and opens full Decision Card detail. See [Decision Timeline contract](../../../docs/model/decision-timeline.md) and [v1 ERD](../../../docs/diagrams/v1-data-model.md).

Verification: BE build and all 31 BE workspace tests passed; FE build and all 8 FE tests passed. The two repository timeline tests and authenticated guild-scoped HTTP test also passed. No operating database was accessed.

