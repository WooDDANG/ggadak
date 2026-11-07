# FE 저장소 연결과 실행

`apps/frontend-main`은 [likelion-kkadak/frontend](https://github.com/likelion-kkadak/frontend)의 Git submodule입니다. 부모 저장소는 FE 파일 전체 대신 사용할 FE 커밋을 기록합니다.

## 처음 받기

```bash
git clone --recurse-submodules <GGADDAK 저장소 주소>
```

이미 부모 저장소를 받았다면 다음 명령을 사용합니다.

```bash
git submodule update --init --recursive
npm install
npm run dev:fe
```

FE 실행 포트는 부모 `.env`의 `FE_PORT`를 사용하며 기본값은 3002입니다. OAuth callback도 같은 주소를 사용해야 합니다. `/api`는 기본적으로 localhost:3001의 BE로 전달합니다.

## 수정하고 PR 만들기

```bash
cd apps/frontend-main
git switch -c fix/example
# 수정과 검증 후
git add <변경 파일>
git commit -m "fix: describe the change"
git push -u origin fix/example
gh pr create --base main
```

FE는 작업 브랜치와 PR로만 변경합니다. main 직접 push와 임의 merge는 금지합니다. PR 생성에 필요한 작업 브랜치 push는 허용합니다.

FE PR이 승인·merge된 뒤 부모 저장소에서 사용할 커밋을 갱신합니다.

```bash
git -C apps/frontend-main fetch origin
git -C apps/frontend-main checkout <승인된 FE 커밋>
git add apps/frontend-main
git commit -m "chore: update frontend submodule"
```

진행 중인 PR 커밋을 부모에서 사용하는 경우 이를 명시합니다. `git submodule update --remote`는 기록된 커밋 대신 추적 브랜치를 따라가므로 의도적으로 최신 FE를 검토할 때 사용합니다.

## 2026-11-07 전환 기록

- 기존 파일 복사본과 로컬 변경은 `.data/frontend-main-before-submodule-20261107`에 보존했습니다.
- 원본 main을 submodule로 연결한 뒤 로그인 연동 수정은 `fix/be-session-integration` 브랜치에서 진행합니다.
- 로그인 응답의 검증된 서버 목록을 먼저 사용합니다. 이전 BE와 연동할 때는 기존 목록 조회로 대체합니다.
- 서버 목록은 가입 서버와 봇 설치 확인된 서버의 교집합입니다. 정상 빈 목록과 확인 불가를 구분하며, 확인 불가 시 로그인을 유지하고 재확인합니다.
- 브라우저 시작 시 HttpOnly 쿠키로 세션을 복원합니다. 포커스 복귀·온라인 복귀·수동 요청으로 서버 목록을 갱신하고 JWT 갱신은 목록 조회와 분리합니다.
- FE·BE·Bot은 Herdr dev 탭의 전용 pane에서 실행합니다. 빌드·회귀 검증은 verify 탭에서 진행합니다.
- 부모 저장소는 검증한 FE 커밋 `18e5b43`를 기록합니다. [FE PR #4](https://github.com/likelion-kkadak/frontend/pull/4)의 검토·병합 대기 커밋이며 자동 merge하지 않았습니다.

리뷰 후속 개선의 실제 FE→BE 검증 범위와 실행 명령은 [브라우저 인증 회귀 검증](frontend-review-verification.md)을 참고합니다.

리뷰 후속 수정은 `fix/auth-review-followups`의 별도 PR #4로 분리했습니다. 기존 PR #3의 브랜치는 `e45aa8b`에 유지합니다.
