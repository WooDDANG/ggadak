# 01: Sync Job 수령 500 오류 복구

**What to build:** Bot이 대기 중인 Sync Job을 정상 수령하고 진행 상태를 저장하며 중단 후 이어서 처리할 수 있게 한다.

**Blocked by:** None (can start immediately).

**Status:** resolved

- [x] 실제 Controller 생성 경로와 비동기 전달 모드에서 Prisma 의존성 누락을 재현하고 수정한다.
- [x] 작업이 없을 때 정상 null 응답, 서비스 인증 거절, 동일 작업의 동시 claim 방지와 임대 기반 복구를 검증한다.
- [x] 격리 DB를 사용하는 HTTP 회귀 테스트를 추가하고 외부 Discord/AI 호출 없이 기존 스캔 계약을 검증한다.

## Answer

공개 HTTP·브라우저 회귀 검증과 전체 218개 테스트가 통과했다. Standards/Spec 별도 리뷰의 수정 필요 항목은 각각 0건이다. 상세 결과는 상위 구현 검증 기록을 따른다.
