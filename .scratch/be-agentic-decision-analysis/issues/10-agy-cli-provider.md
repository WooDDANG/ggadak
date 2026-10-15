# 10: Antigravity agy CLI로 실제 분석 경로 전환

**Status:** resolved

사용자 요청: Gemini CLI 대신 설치된 agy CLI를 사용하도록 변경하고 바로 검증한다.

## 구현 범위

- AI_PROVIDER=agy로 선택하며 루트 .env와 기본 모델을 현재 설치 CLI가 제공하는 gemini-3.8-flash-low로 맞춘다. API 키 대신 BE OS 사용자의 cached agy 인증을 사용한다.
- 추출/검증/수정과 기존 저장/검수 정책을 유지한다. CLI 실패 시 API로 자동 fallback하지 않는다. 기존 provider와 저장된 workflow는 유지한다.
- 독립된 임시 작업 공간에서 매 시도 새 세션을 시작한다. 프롬프트는 stdin, JSON schema는 임시 파일로 전달하며 shell을 사용하지 않는다.
- 전용 agent는 결과 종료용 finish만 허용하며 파일/명령/브라우저/MCP/skill/plugin 도구를 허용하지 않는다. API 키와 서비스 토큰은 자식 환경에서 제외한다.
- SUCCESS와 structured_output/usage를 확인한다. 로그인/실행 파일 누락/할당량/잘못된 출력/취소를 구별하며 deadline에 프로세스 그룹을 종료하고 임시 파일을 정리한다.
- CLI는 HTTP countTokens나 생성 maxOutputTokens 설정을 노출하지 않는다. 입력 토큰 preflight 설정은 지원하지 않음을 명시하고 출력 사용량 한도는 응답 후 검사한다. 계정/model quota는 CLI가 적용한다.
- 독립 CLI fixture와 기존 workspace 테스트, 실제 한국어 샘플의 임시 DB 분석·저장·조회로 검증한다. HTTP 평가 runner를 CLI 예산 처리인 것처럼 사용하지 않는다.

[공식 문서 조사](../../../docs/research/agy-cli-integration.md).

## Answer

2026-10-15: root/provider 기본값을 agy로 전환하고 독립 process transport를 추가했다. 각 단계는 별도의 임시 workspace/new-project/finish-only agent로 실행되며 structured_output과 usage를 기존 workflow에 전달한다. root에 실제 설치된 실행 파일 경로를 설정했으며 자격 증명은 변경하거나 출력하지 않았다.

실제 CLI로 한국어 샘플의 추출·검증·임시 DB 저장·조회가 completed: PostgreSQL agreed, Redis proposed, DB 연결 assignee=민수/dueDate=null. 2회/no repair/약 27.9초, aggregate input 25021/output 598. 운영 DB/실제 Discord 채널은 사용하지 않았다.

독립 실행 fixture 테스트 10개에서 stdin/격리/env/권한/JSON/usage/취소/로그인/할당량/실행 파일 누락을 검증했다. 리뷰에서 발견한 SIGTERM을 무시하는 하위 프로세스 잔존을 회귀 테스트로 재현하고 정상 종료·취소 모두 process group을 제거하도록 수정했다. quota 메시지도 명시적으로 분리했다. 전체 npm test(BE 106/E2E 6 포함), typecheck, lint(기존 logger 경고 1개), 변경 파일 Prettier와 Standards/Spec 리뷰를 통과했다.

AGY의 계정 한도/CLI 시스템 입력은 직접 Gemini API와 다르며, 생성 전에 API의 token/output cap을 강제한다고 주장하지 않는다. cached login은 BE OS 사용자에게 필요하고, global CLI 프로젝트/대화 기록의 보존은 CLI 정책을 따른다. 앱 재시작 후 새 기본 설정을 사용한다.
