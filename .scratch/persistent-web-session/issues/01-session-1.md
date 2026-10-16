# 01: 로컬 FE와 Discord 콜백 주소 분리

**What to build:** GGADDAK을 3002에 고정하고 callback·웹 링크·origin 설정을 일치시켜 별도 앱으로 복귀하지 않는다.

**Blocked by:** None (can start immediately)

**Status:** needs-info

- [x] GGADDAK을 3002에 고정하고 callback·웹 링크·origin 설정을 일치시켜 별도 앱으로 복귀하지 않는다.
- [ ] 합의된 7일 고정 만료·권한 확인·일시 장애 경계를 보존한다.
- [ ] 관련 회귀 테스트·타입 검사·최종 전체 테스트와 코드 리뷰를 통과한다.

## Comments

루트 .env·기본 예시·웹 링크·CORS·FE 포트를 3002로 일치시켰다. FE는 FE_PORT를 루트에서 읽고 포트 충돌 시 자동 이동하지 않는다. 임시 실행에서 실제 FE 제목을 확인한 뒤 자체 프로세스를 종료했다. 다른 앱의 3000은 건드리지 않았다. Discord Portal에 http://localhost:3002/ 등록을 비동기 요청했으나 아직 사용자 확인이 없어 실제 OAuth 검증은 남아 있다.
