# 루트 환경 설정 통합

사용자 요청: 메인 .env만 수정하면 다른 앱에서도 같은 설정을 사용한다.

- BE config는 src/dist 위치를 기준으로 루트 .env를 읽는다. 진입점의 CWD/app-local 탐색을 제거했다. 평가 runner와 search-backfill도 같은 config를 사용한다.
- Bot은 루트 .env를 읽은 뒤 client 모듈을 동적으로 import하여 설정 로딩 전에 의존 모듈이 초기화되는 문제를 방지한다.
- FE Vite envDir는 루트를 가리킨다. 기본 VITE_ 공개 범위를 유지한다.
- DB 명령은 wrapper가 루트 환경을 읽고 루트 CWD에서 absolute schema로 Prisma를 실행한다. 기존 환경 변수의 우선순위를 유지한다.
- 기존 BE DATABASE_URL이 루트에 없어서 해당 설정만 루트 .env에 보존했다. 자격 증명 값과 환경 파일은 커밋하지 않는다.

## 검증

- npm test: 모든 workspace build/test와 E2E 6개 통과.
- npm run typecheck 통과. Bot build도 통과.
- npm run lint 오류 0, 기존 shared logger 테스트의 경고 1개.
- 변경한 코드의 Prettier 검사, git diff --check 통과. 기존 별도 포맷 오류를 수정하는 작업은 포함하지 않았다.
- BE config를 루트, apps/be, apps/bot, /private/tmp에서 각각 import해 provider/model/key가 루트 값과 일치하는지 확인했다. 키 값은 출력하지 않았다.
- Prisma wrapper validate 통과. DB 쓰기 또는 migration 적용은 하지 않았다.
- Standards 리뷰 확정 지적 없음. Spec 리뷰의 Prisma CLI 설정 공백을 wrapper로 보완했다.

이미 실행 중인 앱은 재시작해야 새 설정을 읽는다. Graph smoke HTTP 400 문제는 환경 로딩 변경과 별개이며 아직 해결하지 않았다.
