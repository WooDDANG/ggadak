# 01: WEB_URL 하나로 로그인 복귀 주소와 허용 출처를 정한다

**What to build:** 운영자가 BE에 `WEB_URL`(웹 화면 주소)만 넣으면 Discord 로그인 후 그 주소로 돌아오고, 같은 주소에서 오는 로그인 유지·API 요청이 허용된다. 이미 `DISCORD_REDIRECT_URI`나 `CORS_ORIGINS`를 넣어 둔 설치는 그 값을 그대로 쓴다.

**Blocked by:** None (can start immediately)

**Status:** done

- [x] `WEB_URL`만 있으면 로그인 복귀 주소는 `WEB_URL`의 origin + `/`이다
- [x] `DISCORD_REDIRECT_URI`가 있으면 그 값이 우선한다
- [x] 허용 출처 목록에 `WEB_URL`의 origin이 자동으로 들어가고 중복되지 않는다
- [x] 로그인 미설정 안내가 `WEB_URL`을 먼저 안내한다
- [x] `.env.example`과 배포 문서가 `WEB_URL` 하나를 기준으로 설명하고, Discord Developer Portal Redirects 등록은 따로 해야 한다고 적는다
