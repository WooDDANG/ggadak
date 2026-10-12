# 11: Why 자연어 검색

**What to build:** 자연어 질문으로 관련 결정과 Rationale·원본 근거를 검색하고 카드와 Discord 출처로 이동한다.

**Blocked by:** 06: 결정 모델 이전과 목록·상세 조회

**Status:** resolved

- [x] 벡터 임베딩 기반 검색 API와 검색 화면을 연결하고 점수·발췌·출처를 제공한다.
- [x] 임베딩 저장·색인 모델과 마이그레이션·ERD를 갱신하고 기존 데이터 색인 작업을 제공한다.
- [x] 검색 대상 상태·서버 범위·조회 개수와 임베딩 공급자 설정을 명시한다.
- [x] 결정 생성·수정·검수 상태 변경 시 색인을 갱신하고 재시작·공급자 실패·권한 범위·관련 질문 검색을 검증한다.


## Answer

Implemented authenticated guild-scoped `GET /api/v1/search`, persisted OpenAI embedding vectors with cosine ranking, Rationale excerpts and Discord sources, plus the Why search UI and generated contracts. CONFIRMED and SUPERSEDED only; limit 1–50 (default 10), question 1–1000 characters. SQLite's additive embedding migration and update trigger durably invalidate every writer's changed decisions; missing documents refresh on search/backfill and retry across provider outages/restarts. This keeps successful review/edit independent of AI availability. Operator backfill requires explicitly selected DATABASE_URL. Configuration, refresh policy and linear-scan limits are documented in [WHY-SEARCH.md](../../../apps/be/WHY-SEARCH.md); ERD updated.

Validation: BE/FE builds, 51 backend tests and 5 frontend tests passed. Search tests cover related wording via injected semantic vectors, persisted index reuse after restart, guild isolation/auth/input bounds, review confirmation, edit invalidation, document-provider failure and retry after restart, discarded exclusion, and frontend authenticated query/result/card/source connection. No operating database changes or external AI calls during verification.
