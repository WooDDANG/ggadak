# 08: 결정 카드 편집

**What to build:** 카드 상세에서 요약·결정 내용·Rationale·카테고리·대안을 수정하고 저장된 내용을 재조회한다.

**Blocked by:** 06: 결정 모델 이전과 목록·상세 조회

**Status:** resolved

- [x] 상세 편집 화면과 PUT API, 생성 클라이언트 및 저장을 연결한다.
- [x] 대안 식별·추가·수정·삭제 정책과 필수값·길이 검증을 API 계약에 명시한다.
- [x] 모델·ERD에 수정 시각과 필요한 변경 이력 저장을 반영하고 버전 검증으로 동시 수정 충돌을 거부한다.
- [x] 일반 편집으로 검수·결정 교체 규칙을 우회할 수 없고, 저장 후 재조회·재시작·권한·충돌 동작을 검증한다.


## Answer

Implemented versioned PUT content editing, stable alternative identity and replacement validation, immutable historical cards, persistent transactional audit snapshots, updated timestamps and a Decision Card editor consuming generated clients. Lifecycle, approval, replacement links and Action Items remain review-owned. See [edit contract/model](../../../docs/model/decision-edit.md).

Verification: BE/FE builds and code generation; HTTP edit suite covers readback, authentication, guild isolation, lifecycle field rejection, stale versions, required/length validation, alternative addition/update/removal/identity and restart. Repository persistence/replacement regression suite: 11 passed. Generated FE transport tests verify edit payload/version and surface conflicts. Tests use isolated migrated SQLite databases; operating DB untouched.
