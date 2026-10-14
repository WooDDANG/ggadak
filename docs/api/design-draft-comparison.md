# 까닭 API 설계 초안 ↔ 현재 Swagger 비교

비교 기준: 2026-10-13에 전달받은 화면 기반 API 설계 초안과 [현재 swagger.json](../../apps/be/src/api/docs/swagger.json). 실제 FE 연동 계약은 [FE API 문서](frontend-api.md)에 정리했습니다.

이 비교는 API 구현을 초안에 맞게 변경하는 작업이 아니라, 현재 구현과 초안의 차이 및 FE 연동 시 필요한 변경을 기록합니다. 초안의 “🟢 완료”를 실제 API 경로·FE 화면·외부 서비스 연결 검증 완료로 해석하지 않습니다.

## 1. 공통 규칙의 차이

| 항목                                | 설계 초안                               | 현재 계약                              | FE 적용                                         |
| ----------------------------------- | --------------------------------------- | -------------------------------------- | ----------------------------------------------- |
| 응답 envelope                       | success/code/message/data               | v1은 같은 4필드                        | payload는 data에서 읽기                         |
| 성공 code                           | S200 / S202                             | HTTP 200·202 모두 OK                   | 완료·접수 구분은 HTTP 상태와 작업 status로 판단 |
| 성공 message                        | API별 한국어 문구                       | Success                                | 사용자 문구는 FE에서 구성                       |
| 오류 code                           | AUTH_4010, DECISION_4041 등             | UNAUTHORIZED, NOT_FOUND, CONFLICT 등   | 공통 code·HTTP 상태별 처리                      |
| user/decision/ticket/alternative ID | 숫자 예제                               | 문자열                                 | TS 타입 string, Number 변환 금지                |
| 서버 범위                           | 요청 대부분 guildId 생략                | 서버별 API query의 guildId 필수        | 로그인 후 서버 선택을 요청·캐시에 포함          |
| category                            | 아키텍처/인프라/AI·LLM 등               | 입력은 타깃/문제정의/기능/기술/BM/기타 | FE 표시 분류와 API enum의 매핑 합의             |
| lifecycle                           | IN_REVIEW → CONFIRMED/ON_HOLD/DISCARDED | 같은 상태 + SUPERSEDED 이력            | 교체된 카드 이력도 별도 취급                    |
| 날짜                                | 공백으로 구분한 로컬 시각·일자          | 기록된 날짜는 ISO 8601, 미기록은 null  | timezone에 맞게 표시, 누락 날짜 생성 금지       |
| 동시 수정                           | 버전 없음                               | expectedVersion 필수                   | 최신 조회 version 전달, 409에서 재확인          |

OpenAPI 응답 모델 중 일부 inherited nullable 필드의 표기가 실제 도메인 응답과 다를 수 있습니다. 예를 들어 supersedesId·approvedBy는 화면에서 null-safe하게 처리해야 합니다. 이 차이는 FE 문서의 “스펙에서 주의할 부분”에 명시했습니다.

초안의 로컬 저장소 이름은 `kkadak`이지만 이 문서가 참조하는 현재 저장소는 `GGADDAK`입니다. FE 문서 링크는 현재 저장소 기준의 상대 경로입니다.

## 2. 초안의 12개 API 대응표

| 초안 번호 | 화면·기능    | 초안 Method·URI                              | 현재 Method·URI                             | 핵심 변경                                          |
| --------- | ------------ | -------------------------------------------- | ------------------------------------------- | -------------------------------------------------- |
| 1         | OAuth 로그인 | POST /api/v1/auth/login                      | POST /api/v1/auth/login                     | code + state + 브라우저 state 쿠키, authorize 선행 |
| 2         | 채널 조회    | GET /api/v1/discord/channels                 | GET /api/v1/discord/channels                | guildId 필수, channels + monitoredChannelIds       |
| 3         | 채널 저장    | PUT /api/v1/discord/channels                 | PUT /api/v1/discord/channels                | body.channelIds, Manage Server 권한                |
| 4         | Dashboard    | GET /api/v1/dashboard/summary                | GET /api/v1/dashboard                       | counts·sync 필드 이름 변경                         |
| 5         | 수동 동기화  | POST /api/v1/discord/sync                    | POST /api/v1/sync-jobs                      | 202 접수, 별도 Job 상태 조회                       |
| 6         | 검수 목록    | GET /api/v1/review-queue                     | GET /api/v1/review-queue                    | data.items + pageInfo, 상태별 조회                 |
| 7         | 검수 처리    | PATCH /api/v1/review-queue/{ticketId}/status | POST /api/v1/review-queue/{ticketId}/review | action + expectedVersion, 교체 옵션                |
| 8         | 카드 상세    | GET /api/v1/decisions/{id}                   | GET /api/v1/decisions/{id}                  | 문자열 ID, title·reason·dates 계약                 |
| 9         | 카드 편집    | PUT /api/v1/decisions/{id}                   | PUT /api/v1/decisions/{id}                  | title + decision + expectedVersion, 상태 편집 분리 |
| 10        | 카드 목록    | GET /api/v1/decisions                        | GET /api/v1/decisions                       | guildId 필수, v1 items 사용                        |
| 11        | Why 검색     | GET /api/v1/search/why?q=...                 | GET /api/v1/search?query=...                | items[].decision/score/excerpt/sourceUrl           |
| 12        | Timeline     | GET /api/v1/timeline                         | GET /api/v1/decisions/timeline              | groups[].key/count/items + timezone                |

이 표에서 서로 다른 경로는 현재 별칭으로 제공되지 않습니다. FE 요청은 현재 Method·URI로 연결합니다. 경로 이름을 초안대로 변경하거나 별칭을 추가하려면 별도 API 변경 범위와 호환 정책을 정해야 합니다.

## 3. 화면별 데이터·동작 차이

### 3.1 랜딩·Auth

| 초안                     | 현재 계약                                              |
| ------------------------ | ------------------------------------------------------ |
| login에 provider=discord | provider 입력 없음                                     |
| login에 redirectUri      | BE에 사전 설정한 callback 사용, 브라우저 override 없음 |
| code만으로 로그인        | code와 state 필수, authorize 쿠키 포함                 |
| OAuth 시작 API 없음      | GET /api/v1/auth/authorize 추가                        |
| user.id 숫자             | Discord 사용자 문자열 ID                               |
| user.email 문자열        | 현재 scope는 identify/guilds, email=null               |
| 토큰 만료 정보 없음      | expiresAt 제공, JWT 15분                               |
| 세션 관리 미정           | me/guilds/refresh/logout API 제공                      |

FE는 authorize 응답의 URL로 이동한 후 callback query의 code/state로 login을 호출합니다. credentials: include로 쿠키를 유지하고 토큰을 메모리에 보관합니다. 만료 전 refresh를 수행하며, 유효하지 않은 세션은 로그인부터 다시 시작합니다. 서버 선택은 auth/guilds 응답으로 구성합니다.

### 3.2 Discord 설정

| 초안 응답·요청               | 현재 계약·대응                                                  |
| ---------------------------- | --------------------------------------------------------------- |
| data.guildId, guildName      | 채널 응답에 서버 메타데이터 없음; 서버 목록의 id/name 사용      |
| data.botInstalled            | 직접적인 Boolean 필드 없음                                      |
| channels[].channelId         | channels[].id                                                   |
| channels[].channelName       | channels[].name                                                 |
| channels[].channelType=TEXT  | channels[].type=0 — 일반 텍스트 채널                            |
| channels[].isMonitored       | monitoredChannelIds에 id가 있는지 FE에서 계산                   |
| PUT body.monitoredChannelIds | PUT body.channelIds                                             |
| PUT response.updatedCount    | 전체 ChannelSettings 응답; 선택 수는 monitoredChannelIds.length |

저장은 선택 전체를 교체하고 빈 배열로 모두 해제할 수 있습니다. owner 또는 Manage Server 권한이 필요합니다. 같은 서버에서 Bot이 읽을 수 있는 채널만 새로 선택합니다. 이전에 선택한 채널이 inaccessible이어도 제거할 수 있도록 UI에 현재 선택과 접근 상태를 구분합니다.

botInstalled 자체가 화면의 필수 요구라면 설치 상태를 반환하는 BE 계약이 추가로 필요합니다. 채널 조회 실패를 무조건 “Bot 미설치”로 해석하면 인증·권한·외부 장애와 구별되지 않습니다.

### 3.3 Dashboard·동기화

| 초안 필드·동작            | 현재 계약                                 |
| ------------------------- | ----------------------------------------- |
| counts.confirmedCount     | counts.confirmed                          |
| counts.pendingCount       | counts.onHold                             |
| counts.reviewQueueCount   | counts.inReview                           |
| recentDecisions[].summary | V1DecisionDto.title, 없으면 topic         |
| 최근 카드에 ON_HOLD 포함  | 현재 CONFIRMED 최근 5개                   |
| syncStatus.lastSyncedAt   | sync.lastSuccessfulAt                     |
| syncStatus.isSyncing      | sync.latestJob.status로 표시              |
| 동기화 status=IN_PROGRESS | QUEUED / PROCESSING / COMPLETED / FAILED  |
| estimatedWaitSeconds      | 제공하지 않음                             |
| 별도 Job 조회 없음        | GET /api/v1/sync-jobs/{jobId}?guildId=... |

빈 서버는 counts=0, recentDecisions=[], latestJob=null, lastSuccessfulAt=null입니다. 마지막 성공 시각은 완료된 Job의 completedAt이며 새로운 실패·진행 Job이 기존 성공 시각을 지우지 않습니다. 202만 받고 동기화 완료로 표시하면 안 됩니다.

### 3.4 Review Queue

| 초안 필드·동작                 | 현재 계약                                                   |
| ------------------------------ | ----------------------------------------------------------- |
| data.totalCount / tickets      | data.pageInfo.totalElements / items                         |
| ticketId 숫자                  | 문자열, ticketId = id                                       |
| summary / reason / extractedAt | title 또는 topic / rationale / createdAt                    |
| sourceContext                  | source                                                      |
| targetStatus=CONFIRMED         | action=confirm                                              |
| targetStatus=ON_HOLD           | action=defer                                                |
| targetStatus=DISCARDED         | action=reject                                               |
| 확정 시 새로운 decisionId 생성 | 같은 Decision 엔티티의 상태 변경, ID 유지                   |
| 버전 없음                      | expectedVersion 필수                                        |
| 기존 결정 교체 미정            | resolution=replace, predecessorId/version, taskDispositions |

보류 목록은 status=ON_HOLD로 조회합니다. 확정은 기본적으로 Independent Retention이며 기존 확정 결정을 변경하지 않습니다. 교체는 reviewer가 predecessor를 명시적으로 선택하고 unfinished Action Item의 취소·이전을 지정해야 합니다. completed 항목은 이전 카드의 이력에 남습니다. 변경 충돌 409는 재조회와 사용자 재확인이 필요합니다.

### 3.5 카드 상세·편집

| 초안 필드·동작                | 현재 계약                                                     |
| ----------------------------- | ------------------------------------------------------------- |
| summary                       | 응답 title; 편집 요청 title                                   |
| 편집 요청 decisionContent     | 편집 요청 decision                                            |
| alternatives[].rejectedReason | alternatives[].reason                                         |
| alternatives[].id 숫자        | 문자열; 신규 대안은 요청 id 생략                              |
| source.authorName             | 단일 작성자 필드 없음; participants 또는 rawMessages[].author |
| dates.updatedAt               | updatedAt 최상위 필드                                         |
| 편집 시 status=CONFIRMED      | 편집 입력에서 status 거절; 상태 전이는 검수 API               |
| 편집 응답 id/updatedAt만 반환 | 전체 V1DecisionDto 반환                                       |
| 업데이트 버전 없음            | expectedVersion 필수                                          |

편집은 title·decision·rationale·category·alternatives를 모두 보내야 합니다. alternatives는 전체 교체이며 빠진 기존 대안은 삭제됩니다. 과거 Superseded/Rejected 기록은 편집할 수 없습니다. UI에서 상태 변경과 내용 편집을 한 요청으로 묶지 않습니다.

### 3.6 전체 카드 목록

page/size/status/category 외에 guildId가 필수입니다. topic 필터도 사용할 수 있습니다. FE는 items의 v1 모델을 사용하고 decisions는 기존 호환용입니다. 임의 category를 보내지 말고 입력 enum에 맞춰 연결합니다. totalElements/totalPages를 이용해 페이지를 계산하고 0건에서 totalPages=0을 처리합니다.

### 3.7 Why 검색

| 초안                          | 현재 계약                                                       |
| ----------------------------- | --------------------------------------------------------------- |
| q                             | query                                                           |
| data.query                    | 응답 query 없음; FE 입력 상태 유지                              |
| data.results                  | data.items                                                      |
| results[].decisionId          | items[].decision.id                                             |
| summary/category 등 요약 필드 | items[].decision의 V1DecisionDto                                |
| relevanceScore                | score                                                           |
| matchedExcerpt                | excerpt                                                         |
| sourceContext.messageUrl      | sourceUrl 또는 decision.source.messageUrl                       |
| 모든 결정·원본 피드백 검색    | CONFIRMED/SUPERSEDED Decision의 내용·근거·인용·연결된 원문 검색 |

독립적인 External Feedback 엔티티 전체를 합쳐 검색하는 기능은 현재 계약에 없습니다. Decision에 포함된 원문 대화 검색과 별도 피드백 통합 검색을 구분해야 합니다. 검색 임베딩은 추출 AI와 별도 설정이며 현재 OpenAI key가 필요합니다. 공급자 미설정·장애는 503이 될 수 있습니다.

### 3.8 Timeline

| 초안                         | 현재 계약                           |
| ---------------------------- | ----------------------------------- |
| /api/v1/timeline             | /api/v1/decisions/timeline          |
| groupBy만 지정               | guildId 필수, timezone/from/to 추가 |
| data.timeline                | data.groups                         |
| periodLabel                  | groups[].key — FE에서 지역화        |
| decisionsCount               | groups[].count                      |
| decisions                    | groups[].items                      |
| date-only confirmedDate 예제 | 기록된 ISO 8601 확인 시각           |

month/topic/channel/category 그룹을 지원합니다. timezone은 UTC 기본값이며 월 단위 화면은 Asia/Seoul 등 원하는 IANA timezone을 명시합니다. 현재 CONFIRMED이면서 확인 날짜가 있는 카드만 포함합니다. 미기록 날짜를 생성하지 않아 일반 목록 건수와 Timeline 건수가 다를 수 있습니다. 기간은 from 포함·to 미포함입니다.

## 4. 초안에 없지만 현재 제공하는 API

| Method | API                                           | FE 용도                           |
| ------ | --------------------------------------------- | --------------------------------- |
| GET    | /api/v1/auth/authorize                        | 브라우저 state 쿠키와 OAuth URL   |
| GET    | /api/v1/auth/me                               | 사용자 정보                       |
| GET    | /api/v1/auth/guilds                           | 서버 선택·권한 표시               |
| POST   | /api/v1/auth/refresh                          | JWT 갱신·서버 권한 새로고침       |
| POST   | /api/v1/auth/logout                           | 세션 종료                         |
| GET    | /api/v1/sync-jobs/{jobId}                     | 실제 동기화 진행·완료·실패        |
| GET    | /api/v1/decisions/{id}/history                | Analysis Request·재분석 관계 이력 |
| GET    | /api/v1/analysis-deliveries                   | retained failure 및 Bot 연결 상태 |
| POST   | /api/v1/analysis-deliveries/{requestId}/retry | 보존된 실패의 재시도 요청         |

FE는 Bot 전용 Discussion Context 분석·Checkpoints·internal API 대신 위 사용자 API로 연결합니다.

## 5. 후속 작업의 구분

### 5.1 현재 API로 FE에서 적용할 수 있는 변경

- 실제 경로·Method·query/body 이름으로 요청 연결.
- 서버 선택 및 guildId가 포함된 캐시·API 호출.
- 문자열 ID, ISO 날짜와 nullable 데이터 처리.
- title/rationale/reason 및 v1 items의 카드 모델 적용.
- latestJob 상태 polling, 실패·재시도·stale queue 표시.
- expectedVersion 및 교체 시 predecessor/Action Item disposition UI.
- HTTP 상태와 현재 공통 code로 오류 처리.

### 5.2 BE 계약 합의·추가 구현이 필요한 항목

- 명시적인 botInstalled 상태가 필요하면 설치 상태 API/응답 설계.
- 별도 External Feedback의 guild 인증형 등록·조회·통합 검색이 필요하면 신규 계약 설계.
- 세분화된 AUTH_4010·SYNC_4091 등의 오류 코드가 필수라면 공통 오류 계약 변경.
- 숫자 ID, 자유 카테고리, 초안 URI 별칭 등이 필수라면 호환·이력 보존을 포함한 API 변경 설계.

현재 계약으로 가능한 FE 연동에 위 변경을 선행 조건으로 두지 않습니다. 필요한 제품 요구를 먼저 합의합니다.

### 5.3 문서·OpenAPI 보완 대상

- service 보안 scheme 정의 추가.
- 오류 응답·conditional validation·권한 조건 선언 보강.
- inherited nullable 필드, 필수 version, groupBy 기본값을 실제 반환·검증과 일치시키기.
- strict 편집 입력을 additionalProperties 표기에 반영하기.
- source와 Sync Job status를 가능한 범위에서 구체적인 모델로 선언하기.

이 작업에서는 API 코드나 FE 소스를 변경하지 않았습니다. 위 보완 대상은 현재 FE 연동 문서에 주의사항으로 반영했습니다.
