# 02: v1 API 호환 기반 확장

**What to build:** 기존 결정 조회를 v1 API와 공통 응답으로 제공하고 프론트에서 생성된 클라이언트로 조회한다.

**Blocked by:** 01: BE 미사용 코드와 중복 구현 정리

**Status:** resolved

- [x] 기존 결정 조회에 대응하는 v1 경로를 추가하고 기존 API의 응답 계약을 유지한다.
- [x] v1 성공·에러·검증 실패·404·요청 제한 응답은 success, code, message, data 형식을 사용한다.
- [x] TSOA에서 OpenAPI와 프론트 클라이언트를 생성하고 결정 조회 화면에 연결한다.
- [x] 기존·신규 조회 계약과 생성된 클라이언트의 연동을 검증한다.


## Answer

v1 결정 목록 조회와 공통 응답을 추가하고 기존 API 계약을 보존했다. 프론트 결정 조회는 Orval 생성 클라이언트를 소비한다. API 오류, JSON 검증 실패, 미등록 경로, 요청 제한은 v1 공통 응답을 사용한다. 현재 목록 payload는 호환용 decisions이며 서버 범위·페이지 계약은 후속 04/06에서 확장한다.

검증: BE build, 서버 HTTP 테스트 12개, BE 저장소·서비스 테스트 27개, FE build 및 생성 클라이언트 소비 테스트 1개 통과. 테스트 DB만 사용했고 운영 DB는 변경하지 않았다.

후속 인터페이스: ApiResponse<T>, apiSuccess, apiFailure, isV1Request 및 V1DecisionController.listV1Decisions.
