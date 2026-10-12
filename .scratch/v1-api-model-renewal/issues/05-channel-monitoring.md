# 05: Discord 채널 모니터링 설정

**What to build:** 서버 채널을 선택해 저장하면 봇이 저장된 대상 채널만 모니터링한다.

**Blocked by:** 04: Discord 로그인과 서버 접근 권한

**Status:** resolved

- [x] 채널 목록 조회와 모니터링 설정 저장을 화면·API·DB·봇까지 연결한다.
- [x] 길드·채널·모니터링 설정의 모델과 마이그레이션 및 ERD를 갱신한다.
- [x] 봇 미설치·접근 불가·다른 서버 채널 선택을 처리하고 CORS 설정을 실제 허용 출처 정책에 반영한다.
- [x] 재시작 후 설정 보존과 비대상 채널 제외, 채널 권한 변경을 검증한다.


## Answer

모니터링 대상의 원자적 교체·영속 저장과 실시간 Discord 권한 재검증을 제공한다. 생성된 v1 클라이언트를 연결한 채널 설정 화면과 Bot 이벤트/스캔의 fail-closed 필터를 구현했다. Guild–MonitoredChannel 추가 마이그레이션과 [ERD](../../../docs/diagrams/v1-data-model.md)를 갱신하고 명시적 CORS allowlist 및 BOT_SERVICE_TOKEN 설정을 문서화했다.

검증: BE build + 기존 nested tests 31개, 채널/Discord 어댑터/인증 HTTP tests 4개, Bot build/tests 9개, FE build/tests 3개 통과. 임시 SQLite에서 기존 데이터 보존 migration 검증과 Prisma 연결 종료 후 재시작 설정 보존, 권한 철회/봇 미설치/다른 서버 선택/중복 선택/빈 선택을 확인했다. 운영 DB는 변경하지 않았다. Discord 실호출은 주입한 외부 어댑터로 대체했다.
