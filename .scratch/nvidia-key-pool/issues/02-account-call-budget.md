# 02: 계정별 호출 제한과 장애 대기 처리

**What to build:** 다중 BE 프로세스에서 계정별 호출 예산과 오류 상태를 공유하고 Analysis Queue가 호출 가능 시점까지 재예약한다.

**Blocked by:** 01: NVIDIA 키 4개를 AI Call에 순환 사용

**Status:** ready-for-agent

- [x] 계정별 분당 제한을 원자적으로 예약하고 설정 가능하게 한다.
- [x] Retry-After와 인증 실패는 해당 키에 적용한다.
- [x] 대기는 실제 AI Call의 예산을 소모하지 않는다.
- [x] 운영 문서와 비밀값 없는 키별 상태 로그를 제공한다.
- [x] 다중 프로세스·재시작·취소·제한 창 경계와 오류를 검증한다.

## Comments

두 Prisma 연결의 동시 예약과 새 풀 인스턴스의 상태 복원, 분 경계의 간격 유지, 429 cooldown·인증 실패 제외·키 교체 복구·취소를 검증했다. Analysis Queue 테스트에서 대기가 재시도 횟수를 소비하지 않고 Extract 다음 Verify부터 재개됨을 확인했다. 실제 키 인증과 운영 DB migration은 실행하지 않았다.
