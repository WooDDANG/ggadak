# Discord 스캔 실행과 운영 검증

스캔 대상은 사용자가 저장한 모니터링 텍스트 채널이다. Discord 로그인이 성공해도 내부 서비스 인증, DB 스키마와 채널 등록은 각각 준비해야 한다. 사람의 검수 전 AI 결과는 Decision Candidate다.

## 실행 전 준비

1. 루트 `.env`에서 `DATABASE_URL`이 가리키는 활성 SQLite 파일을 확인한다. Prisma의 상대 파일 경로는 schema 디렉터리를 기준으로 해석한다. 현재 로컬 설정 `file:./decisions.sqlite`는 `apps/be/prisma/decisions.sqlite`를 사용한다.
2. 활성 DB와 별도로 존재하는 legacy DB를 검사·백업한다. 실행 중인 SQLite는 파일 복사 대신 SQLite backup API를 사용해 일관된 snapshot을 만든다. 백업에는 대화·자격증명 저장 데이터가 포함될 수 있으므로 `.data` 등 추적되지 않는 로컬 저장소에 보관한다.
3. `npm run db:migrate --workspace=@ggaddak/be`로 기존 additive migration을 적용한다. 기존 Decision의 개수와 내용 보존, SQLite 무결성, 미적용 migration 여부를 확인한다.
4. `DISCORD_BOT_TOKEN`은 Bot의 Discord 접근에 사용한다. `BOT_SERVICE_TOKEN`은 BE와 Bot이 공유하는 별도의 임의 비밀값이다. 웹 OAuth의 Client ID·Secret·Redirect URI·AUTH_SECRET도 별도다. [웹 로그인 설정](../../apps/be/AUTH.md)을 참고한다.
5. 루트 `.env` 변경 후 BE와 Bot을 모두 재시작한다. 기본 dev 명령은 빌드된 파일을 실행하므로 소스 변경은 먼저 빌드해야 한다. FE의 기본 로컬 주소는 `http://localhost:3000/`이다.
6. FE의 채널 설정에서 사용자가 선택한 채널을 저장한다. Bot의 채널 보기·메시지 기록 보기 권한이 있어야 한다. 등록이 0개라면 웹 Sync Job은 생성되지 않으며, Discord 수동 스캔도 미등록 채널의 메시지를 분석하지 않는다.

## 확인 순서

한 채널에서 먼저 명시적 스캔을 실행하고, 분석 성공·DB 저장·Review Queue 조회를 확인한다. Discord 슬래시 명령의 범위와 전체조회 옵션을 구분한다. ‘전체조회’는 과거 범위이고, ‘서버 전체 채널’은 채널 범위다. 서버 범위에서도 등록된 모니터링 대상만 분석한다.

이후 FE 수동 동기화에서 저장된 모니터링 채널을 대상으로 Sync Job을 생성하거나 Discord의 서버 범위 스캔을 실행한다. 두 경로는 같지 않다. FE는 durable Sync Job의 QUEUED/PROCESSING/COMPLETED/FAILED와 채널별 집계를 조회하고, Discord 명령은 스캔 실행 결과를 비공개 명령 응답으로 전달한다. 명령을 재전송하기 전 보관된 요청·실패 상태를 확인한다.

Bot의 Egress Queue 재시도는 같은 Analysis Request ID를 유지한다. 사람이 의도적으로 재분석할 때는 새 요청이 생성된다. 실패를 완료로 세거나 실패 구간을 넘어 Channel Checkpoint를 진행시키지 않는다. 완료한 채널은 복구 시 다시 분석하지 않으며, lease를 잃은 worker는 다음 채널을 시작하면 안 된다. [전달·스캔 계약](../adr/0020-analysis-delivery-and-scan-coverage.md)을 따른다.

## 로그 해석

| 신호 | 의미·조치 |
| --- | --- |
| API 조회의 304 | 캐시된 결과 사용. 그 자체로 분석 실패가 아님 |
| BOT_SERVICE_TOKEN is not configured | 공유 토큰 누락. 루트 설정 후 BE·Bot 모두 재시작 |
| 내부 API 401 | 공유 토큰 누락·불일치 또는 재시작 전 설정 사용 |
| 모니터링 채널 0개 | FE에서 대상 채널 선택·저장 필요 |
| Bot cannot access / not installed | 선택한 서버에 Bot이 설치돼 있는지와 권한 확인 |
| 분석용 컬럼 누락 | 활성 DB·백업을 확인하고 migration 적용 |
| 분석 503 | 원인에 따라 통신·서비스 설정·provider 가용성 확인. 성공으로 처리하지 않음 |
| 최종 분석 422 | 보존된 오류를 확인하고 필요 시 새 수동 분석. 같은 terminal 요청 재전송은 재분석이 아님 |

## 2026-10-15 로컬 준비 기록

- 루트 설정으로 선택된 활성 DB와 별도 legacy DB 2개를 SQLite backup API로 백업했다. 위치는 로컬 `.data/backups/discord-scan-20261015T060850Z/`이며 Git에 포함하지 않는다.
- `202610140001_agentic_analysis`를 적용했다. 총 15개 migration이 적용된 상태다.
- 활성 DB의 Decision 305건은 적용 전후 내용 해시가 동일하고 `quick_check`는 `ok`였다. 기존 메시지나 Decision을 재작성하지 않았다.
- 앞선 점검에서 실제 서버의 내부 모니터링 API가 공유 토큰으로 200을 반환했다. 이번 시점에 Bot이 설치된 서버와 텍스트 채널 목록도 조회했다. 대화 내용은 아직 읽거나 AI에 전달하지 않았다.
- 현재 모니터링 채널은 0개이며, 실제 검증 대상의 사용자 선택을 기다리고 있다. 실제 Discord → AI → 운영 DB → FE 검증과 서버 전체 스캔 완료를 주장하지 않는다.

[진행 티켓](../../.scratch/discord-scan-readiness/issues/), [전체 기능 현황](../decision-features.md).

## 장시간 분석의 대기·복구

한 Analysis Request에 여러 세션이 있으면 총 실행 시간이 Bot의 HTTP 대기 시간(기본 190초)을 넘을 수 있다. 연결 대기 시간 종료와 BE 분석 중단은 같지 않다. 같은 요청을 전달했을 때 내부 legacy 분석 API가 503과 정확한 `Analysis is already in progress; retry this request` 오류를 반환하면, Bot은 이를 작업 진행 중 상태로 보존하고 backoff 후 다시 확인한다. 이 확인은 실패 재시도 예산을 소모하지 않는다. 임의의 503을 진행 중으로 취급하지 않으며, 실제 통신·provider 실패의 제한은 유지한다.

대기 중 Scan Range가 있는 Sync Job은 채널을 실패로 확정하지 않는다. PROCESSING 상태와 저장한 요청을 유지하고, worker lease 만료 후 같은 scan manifest로 재개한다. 완료한 구간은 결과를 회수하고 checkpoint를 복구하며, pending이 사라진 뒤 남은 실제 실패만 최종 집계한다. Review Queue의 복구 화면은 이 경우 ‘서버에서 분석 진행 중’으로 표시한다.

실제 점검 중 사용자가 세 채널을 모두 지정했고, 권한 수정 뒤 3개 채널의 모니터링 등록을 완료했다. 한 요청에서 새 후보 7건과 graph 저장을 확인했다. 이 기록은 부분 성공이며 전체 작업 완료나 사람의 확정을 뜻하지 않는다.
