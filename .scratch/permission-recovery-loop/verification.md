# 권한 자동 복구 순환 차단 검증

## 원인과 수정

지속적인 데이터 권한 확인 실패 뒤 서버 목록 조회만 성공하면, 화면 복구가 전체 데이터를 다시 조회했다. 다시 권한 오류가 나면 같은 자동 복구가 반복됐다. 기존 Chrome 진단은 500ms에21회 반복을 재현했고, 진단용 복사본에서 복구 후 전역 재조회 한 문장만 제외하면 반복이 멈췄다.

수정은 동일 계정·서버의 실패 에피소드에 자동 복구를 한 번만 허용한다. 서버 목록 성공이나 무관한 데이터 성공은 제한을 초기화하지 않는다. 실제 실패했던 데이터 조회 성공, 명시적 재시도, 계정·서버 변경을 구분한다. 지속 실패에서는 화면을 숨김/inert 상태로 유지하고 데이터 요청을 차단하며 로그인과 편집 초안을 보존한다.

## 실행 명령

Herdr verify의 Tests · Build pane에서 실행한다.

```bash
node --test apps/frontend-main/tests/permission-recovery.browser.test.mjs
npm run test:e2e -- tests/e2e/permission-recovery.test.ts
npm run typecheck
npm test
```

FE 회귀는 실제 App과 제어된 HTTP 응답으로 자동 확인 횟수·수동 실패/성공·초안 복구·focus/online 차단을 확인한다. 실제 FE→BE 회귀는 실제 인증·세션·데이터 인가·서버 목록 응답을 통과하며, 외부 Discord adapter에 429에 해당하는 실패와 정상 가입 관측을 번갈아 주입한다. 실제 Discord에는 요청하지 않는다.

이 수정은 고정 주기 서버 조회나 새 권한 캐시 시간을 추가하지 않는다. 기존 사용자 커밋과 pre-commit hook을 보존하며, hook의 타입 검사·전체 테스트도 검증 pane에서 실행한다.
