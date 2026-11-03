# 이벤트 기반 서버 접근 검증

## 검증 경계

- Bot 이벤트 수신과 서비스 인증 HTTP 전달, journal 보존·재시도·중복·순서 공백·reset ACK 유실·재시작·shard Resume.
- BE 실제 HTTP의 두 사용자/여러 세션 격리, ID 변조, 즉시 탈퇴 차단, 재가입, 역할 상실, 지연 OAuth 결과 거절, Bot 설치/일시 장애 구분.
- FE 실제 Chrome의 idle 상태 무조회, JWT 만료 복구, 권한 상실 후 cache/선택 서버 복구, 사용자 전환, 장애 시 데이터 접근 보류.
- 별도 E2E에서 실제 Bot publisher와 BE 서버를 연결해 기존 JWT 차단 및 서비스 인증 Feedback 저장/조회 확인.

## 실행

모든 build·생성·test·typecheck·lint는 Herdr ggaddak 세션의 verify / Tests · Build pane에서 직렬 실행했다.

- `npm run db:generate --workspace=@ggaddak/be`: 통과. 선택된 운영 DB에 migration을 적용하는 명령은 실행하지 않았다.
- `npm run api:sync`: 통과. TSOA와 Orval 계약 갱신.
- 변경 파일 Prettier와 Prisma schema format: 완료.
- `npm run lint && npm run typecheck && npm test`: 통과. 전체 workspace build와 E2E 포함.
- 전체 run에서 BE 175, Bot 50, FE 21, E2E 9개 통과를 확인했다. Shared도 root의 전체 workspace 테스트 명령에 포함돼 통과했다.

## 배포 전제조건

- 기존 선택 DB를 백업하고 additive migration `202611030001_guild_access_events` 적용.
- Bot의 Server Members Intent를 Portal에서 활성화한 뒤 `DISCORD_GUILD_MEMBERS_INTENT=true` 설정. 기본 false에서는 실제 접근 시 OAuth 검증으로 보호한다.
- 실제 Discord 계정의 탈퇴·재가입 및 Bot 제거/재설치는 fixture 성공과 구분해 확인한다.
- 하나의 전체 Discord client를 전제로 하며, 여러 Bot producer 프로세스의 동시 권한 관측은 현재 허용하지 않는다.
- Bot 프로세스 강제 종료는 최대 35초 lease 만료 후 감지한다. 이 동안에도 BE가 이미 반영한 탈퇴는 거절하며, lease 만료 뒤에는 요청 시 재검증한다.

## Standards

리뷰 진행 중.

## Spec

리뷰 진행 중.
