# 이벤트 기반 서버 권한 운영

## 설정과 적용

- BE와 Bot의 `BOT_SERVICE_TOKEN`을 일치시킨다. 이 값은 FE에 전달하지 않는다.
- 사용자 탈퇴·역할 변경을 관측하려면 Discord Developer Portal의 Bot 설정에서 Server Members Intent를 활성화하고 Bot에 `DISCORD_GUILD_MEMBERS_INTENT=true`를 설정한다. 설정을 활성화하지 않은 채 intent를 요청하면 Discord가 연결을 거절할 수 있다. 기본값 false는 요청 시 OAuth 재검증을 사용한다.
- Bot의 `GUILD_ACCESS_DELIVERY_DIR`은 지속 가능한 쓰기 디렉터리여야 한다. 기본값은 `.data/guild-access`다. 한 디렉터리는 한 producer만 소유한다.
- 선택한 DB를 백업하고 기존 DB upgrade 절차로 `202611030001_guild_access_events` migration을 적용한 뒤 새 BE를 시작한다. 테스트는 운영 DB에 migration을 적용하지 않는다.
- 이 변경은 Portal 설정을 자동으로 변경하지 않는다. 실제 Discord 계정의 탈퇴·재가입과 Bot 제거/재설치는 배포 환경에서 별도로 확인한다.

## 정상 동작

1. Bot이 Ready 상태에서 전체 서버 관측 snapshot을 서비스 인증으로 BE에 전달한다. 이 reset은 이전 권한 증명을 무효화한다. 일시 unavailable 서버를 실제 제거된 서버로 판정하지 않는다.
2. 멤버 탈퇴는 해당 사용자/서버의 접근을 제거한다. 멤버 역할·역할 권한·서버 소유권 변경은 관련 권한 증명을 무효화한다. 이벤트만으로 새 권한을 부여하지 않는다.
3. 새 권한 증명은 OAuth 조회로 확인하며, 이벤트와 조회가 경합하면 이전 조회 결과 저장을 거절한다. 사용자별 동시 조회는 공유한다.
4. 모든 이벤트를 전달한 연결만 로컬 heartbeat로 lease를 유지한다. heartbeat는 10초마다 전송하고 lease는 35초다. Discord 권한 조회는 이 타이머에서 수행하지 않는다.
5. FE는 실제 요청에서 만료된 JWT를 cookie 기반 token endpoint로 갱신한다. 권한 확인 오류는 서버 목록과 선택 서버를 복구하고 기존 데이터 캐시를 제거한다. 거절된 쓰기를 자동 재실행하지 않는다.

## 연결과 전달 장애

- Bot은 변경을 journal에 기록한 후 순서대로 전송한다. 실패 시 같은 sequence를 재시도하고 BE는 중복을 무해하게 처리한다.
- Gateway Resume은 재생 이벤트 전달이 끝난 뒤 연결 신뢰를 복원한다. 새 Identify는 새 epoch/reset으로 기존 증명을 무효화한다.
- BE 재시작은 기존 연결 신뢰를 제거한다. Bot의 다음 전달은 reset을 요구받고 새 epoch로 복구한다.
- sequence 공백이나 잘못된 heartbeat는 즉시 관측 신뢰를 제거한다. Bot 프로세스가 갑자기 종료돼 알리지 못하면 기존 lease 만료 후 신뢰가 사라진다. 이는 최대 35초의 연결 장애 감지 지연이며, 이벤트 전달 자체의 무지연 보장은 아니다.
- 이벤트 신뢰가 없거나 Bot이 미설치인 서버는 실제 접근 시 가입·권한을 재검증한다. Discord 일시 장애에서 데이터를 반환하지 않지만 유효한 로그인 세션은 유지한다.
- 여러 Bot producer가 동시에 연결 신뢰를 주장할 수 없다. 현재 배포는 하나의 Discord client가 전체 shard 복구 상태를 종합한다. 별도 프로세스 단위 sharding은 producer별 서버 소유권 계약이 추가로 필요하다.

## 회귀 검증

Herdr verify pane에서 Bot의 이벤트/전달 테스트, BE의 실제 HTTP 권한 테스트, FE의 브라우저·transport 테스트를 실행한다. 두 사용자 격리, 기존 JWT 거절, 재가입, 지연 OAuth 조회, 역할 상실, unavailable/제거 구분, 재시작, 재시도, sequence 공백, idle 상태 무조회와 token-only 갱신을 확인한다. Portal 설정과 실제 Gateway 관측 검증은 fixture 성공과 구분해 기록한다.
