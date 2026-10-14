# 까닭 FE API 연동 문서

작성 기준: 2026-10-14 · BE API 버전 `1.0.0` · OpenAPI `3.0.0`  
원본: [swagger.json](../../apps/be/src/api/docs/swagger.json) · 스펙 SHA-256: `65e4cc17b5abefcfd0165fa0a7de428308822dae46131670d09d9c5016140956`  
Agentic 분석·추가 그래프 계약: [별도 명세](agentic-analysis.md)

설계 초안과의 차이: [초안 비교표](design-draft-comparison.md)

이 문서는 FE가 현재 BE에 연결할 때 사용하는 계약입니다. 경로·필드·필수 여부·성공 상태는 Swagger를 기준으로 정리했고, 스펙에 빠진 인증 흐름·권한·조건부 검증은 **구현 보완**으로 표시했습니다. 예제 값은 합성 데이터입니다. “스펙 존재”는 실제 FE 화면 구현이나 외부 Discord/AI 연결 검증 완료를 뜻하지 않습니다.

## 목차

- [연결·공통 규칙](#connection)
- [화면별 API 요약](#overview)
- [화면별 상세 API](#endpoints)
- [공통 데이터 모델](#models)
- [오류 처리](#errors)
- [화면 갱신 흐름](#refresh)
- [스펙 주의사항](#caveats)
- [Bot·기존 API 부록](#appendix)
- [설계 초안 비교표](design-draft-comparison.md)

<a id="connection"></a>

## 1. 연결과 공통 규칙

### 1.1 개발 환경

| 항목           | 값                                                               |
| -------------- | ---------------------------------------------------------------- |
| BE 기본 Origin | `http://localhost:3001`                                          |
| Swagger UI     | `http://localhost:3001/api-docs/`                                |
| 현재 Vite FE   | `http://localhost:3000`                                          |
| FE 요청 경로   | `/api/v1/...` — Vite `/api` proxy 또는 동일 Origin reverse proxy |
| 데이터 형식    | `Content-Type: application/json`                                 |
| 인증           | `Authorization: Bearer <accessToken>`                            |

BE 시작은 루트에서 `npm run dev:be`입니다. `npm run swagger --workspace=@ggaddak/be`는 문서·라우트 생성이며 서버 실행은 아닙니다. BE 빌드에도 Swagger 생성이 포함됩니다.

쿠키가 필요한 로그인 단계는 `credentials: 'include'`를 사용합니다. FE 콜백 URI는 BE의 설정과 Discord OAuth 등록값이 정확히 같아야 합니다. 현재 Vite 포트는 3000이며, 다른 포트를 쓰는 팀은 해당 콜백·CORS 설정을 맞춰야 합니다. 현재 쿠키 정책은 same-site 배치를 전제로 합니다.

### 1.2 성공·실패 응답

`/api/v1/...`는 다음 네 필드로 응답합니다. HTTP 200과 202 모두 현재 성공 code는 `OK`, message는 `Success`입니다. 초안의 `S200`·`S202`는 구현 계약이 아닙니다. 화면에 표시할 한국어 문구는 FE에서 정합니다.

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {}
}
```

```json
{
  "success": false,
  "code": "CONFLICT",
  "message": "Stale candidate version",
  "data": null
}
```

응답 HTTP 상태와 `success`를 함께 확인하고 payload는 `data`에서 꺼냅니다. `data`가 배열인지 객체인지 각 API별로 확인해야 합니다. `/api/config/policy`·`/api/feedbacks`·Bot 전용 `/api/discussions/...` 등 비-v1 API는 같은 envelope를 쓰지 않으므로 부록에서 구분합니다.

### 1.3 ID·날짜·페이지

- user/guild/channel/decision/ticket/job/request/alternative/Action Item ID는 문자열입니다. Discord snowflake나 permissions를 JavaScript Number로 변환하지 않습니다.
- 기록된 날짜는 ISO 8601 문자열입니다. 확인 날짜 등이 기록되지 않았으면 null이고 FE에서 임의 날짜를 생성하지 않습니다.
- 목록 page는 1부터 시작합니다. 기본 size=20, 구현상 page는 양의 정수이고 size는 1–100 정수입니다.
- `pageInfo`는 `currentPage`, `pageSize`, `totalElements`, `totalPages`입니다. 빈 목록의 totalPages는 0일 수 있습니다.
- optional은 필드 생략 가능, nullable은 null 가능을 뜻합니다. 중첩 객체의 “부모 제공 시 필수”는 해당 객체/배열 원소를 보낼 때의 필수 필드입니다.
- 대부분의 서버별 API는 query의 guildId가 필수입니다. 로그인 서버 선택을 바꿀 때 캐시도 guildId로 구분합니다.

### 1.4 권한 기준 — 구현 보완

조회·검수·편집은 로그인한 사용자의 서버 membership을 확인합니다. 채널 설정 저장·수동 Sync Job 생성·Analysis Request 재시도는 서버 owner 또는 Manage Server 권한이 추가로 필요합니다. FE에서 버튼 노출을 제한하더라도 실제 허용 여부는 BE가 검사합니다.

### 1.5 브라우저 호출 예제

```ts
async function api<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, credentials: 'include', headers });
  const body = await response.json();
  if (!response.ok || body.success !== true) {
    throw Object.assign(new Error(body.message ?? 'API 요청 실패'), {
      status: response.status,
      code: body.code,
      details: body.data,
    });
  }
  return body.data as T;
}
```

이 예제는 v1 API용입니다. 동일 Origin/proxy를 기준으로 하며, 별도 BE Origin을 쓰면 path 앞에 Origin을 붙입니다. query는 URLSearchParams, path ID는 encodeURIComponent로 인코딩합니다. 새 FE 프로젝트에서는 이 문서와 스펙을 함께 사용하거나 Orval 클라이언트를 생성할 수 있습니다. 기존 저장소의 `npm run api:sync`는 FE 생성 코드도 변경하는 명령입니다.

<a id="overview"></a>

## 2. 화면별 API 요약

| 화면         | 호출 순서·용도                                                                       |
| ------------ | ------------------------------------------------------------------------------------ |
| 랜딩·로그인  | authorize → Discord 이동 → login → me/guilds → 서버 선택                             |
| Discord 설정 | channels 조회 → 전체 channelIds 저장                                                 |
| Dashboard    | dashboard 조회 → sync-jobs 생성 → job 상태 polling → 요약·Review Queue 갱신          |
| Review Queue | 대기/보류 목록 조회 → 버전 확인 → confirm/defer/reject → 관련 목록 갱신              |
| 상세·편집    | 카드 조회 → expectedVersion 포함 전체 PUT → 반환 카드로 갱신                         |
| 전체 목록    | guildId/status/category/topic + page/size로 조회                                     |
| Why 검색     | query 전송 → items[].decision 상세 카드 열기                                         |
| Timeline     | timezone/groupBy/from/to 조회 → groups[].items의 카드 상세 열기                      |
| 실패 복구    | analysis-deliveries 조회 → retained-failure retry → 명령 수신·실제 분석 상태 polling |

| Method | 경로                                            | 성공 | 인증       |
| ------ | ----------------------------------------------- | ---- | ---------- |
| `GET`  | `/api/v1/auth/authorize`                        | 200  | 없음       |
| `POST` | `/api/v1/auth/login`                            | 200  | 없음       |
| `GET`  | `/api/v1/auth/me`                               | 200  | Bearer JWT |
| `GET`  | `/api/v1/auth/guilds`                           | 200  | Bearer JWT |
| `POST` | `/api/v1/auth/refresh`                          | 200  | Bearer JWT |
| `POST` | `/api/v1/auth/logout`                           | 200  | Bearer JWT |
| `GET`  | `/api/v1/discord/channels`                      | 200  | Bearer JWT |
| `PUT`  | `/api/v1/discord/channels`                      | 200  | Bearer JWT |
| `GET`  | `/api/v1/dashboard`                             | 200  | Bearer JWT |
| `POST` | `/api/v1/sync-jobs`                             | 202  | Bearer JWT |
| `GET`  | `/api/v1/sync-jobs/{jobId}`                     | 200  | Bearer JWT |
| `GET`  | `/api/v1/review-queue`                          | 200  | Bearer JWT |
| `POST` | `/api/v1/review-queue/{ticketId}/review`        | 200  | Bearer JWT |
| `GET`  | `/api/v1/decisions/{id}`                        | 200  | Bearer JWT |
| `PUT`  | `/api/v1/decisions/{id}`                        | 200  | Bearer JWT |
| `GET`  | `/api/v1/decisions/{id}/history`                | 200  | Bearer JWT |
| `GET`  | `/api/v1/decisions`                             | 200  | Bearer JWT |
| `GET`  | `/api/v1/search`                                | 200  | Bearer JWT |
| `GET`  | `/api/v1/decisions/timeline`                    | 200  | Bearer JWT |
| `GET`  | `/api/v1/analysis-deliveries`                   | 200  | Bearer JWT |
| `POST` | `/api/v1/analysis-deliveries/{requestId}/retry` | 202  | Bearer JWT |
| `GET`  | `/api/v1/analysis-requests/{requestId}`         | 200  | Bearer JWT |
| `GET`  | `/api/v1/analysis-requests/{requestId}/graph`   | 200  | Bearer JWT |

<a id="endpoints"></a>

## 3. 화면별 상세 API

### 3.1 랜딩·Discord 로그인

로그인 순서는 authorize 응답 URL로 브라우저 이동 → FE 콜백의 code/state 수신 → login 요청입니다. HttpOnly state 쿠키를 JavaScript로 직접 읽을 필요가 없습니다. state는 브라우저에 묶인 일회성 값이라 로그인 실패 시 authorize부터 다시 시작합니다. JWT 만료 전에 refresh(예: 10분 주기)하며, 이미 만료된 토큰은 다시 로그인합니다.

#### `GET /api/v1/auth/authorize`

**operationId:** `AuthorizeDiscord` · **인증:** 없음

**구현 보완:** Discord 인증 URL을 반환하고 HttpOnly OAuth state 쿠키를 설정합니다. 브라우저에서 credentials를 포함해 먼저 호출해야 합니다.

**Path/query 입력:** 없음.

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<object>`

| 필드  | 타입     | 필수 | 설명 |
| ----- | -------- | ---- | ---- |
| `url` | `string` | 예   | —    |

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "url": "https://discord.com/oauth2/authorize?client_id=example&state=example"
  }
}
```

#### `POST /api/v1/auth/login`

**operationId:** `LoginDiscord` · **인증:** 없음

**구현 보완:** Discord가 FE 콜백에 전달한 code와 state를 그대로 보냅니다. authorize에서 받은 쿠키가 필요합니다. provider·redirectUri는 요청 필드가 아니며 콜백 URI는 BE 설정에서 결정합니다. 응답 accessToken은 15분 유효하고 expiresAt 전에 갱신해야 합니다.

**Path/query 입력:** 없음.

**Request Body** — 필수

| 필드    | 타입     | 필수 | 설명 |
| ------- | -------- | ---- | ---- |
| `state` | `string` | 예   | —    |
| `code`  | `string` | 예   | —    |

**Response:** HTTP 200, `ApiResponse<object>`

| 필드          | 타입          | 필수 | 설명 |
| ------------- | ------------- | ---- | ---- |
| `user`        | `AuthUserDto` | 예   | —    |
| `expiresAt`   | `string`      | 예   | —    |
| `tokenType`   | `string`      | 예   | —    |
| `accessToken` | `string`      | 예   | —    |

**요청 예제**

```json
{
  "code": "example-discord-oauth-code",
  "state": "example-browser-bound-state"
}
```

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "accessToken": "<accessToken>",
    "tokenType": "Bearer",
    "expiresAt": "2026-10-13T10:15:00.000Z",
    "user": {
      "id": "123456789012345678",
      "name": "팀원 A",
      "email": null,
      "avatarUrl": null,
      "discordUserId": "123456789012345678"
    }
  }
}
```

#### `GET /api/v1/auth/me`

**operationId:** `GetCurrentUser` · **인증:** Bearer JWT

현재 로그인한 사용자입니다. email은 현재 OAuth scope에 포함되지 않아 null입니다. user.id와 discordUserId는 문자열입니다.

**Path/query 입력:** 없음.

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<AuthUserDto>`

#### `GET /api/v1/auth/guilds`

**operationId:** `ListAuthGuilds` · **인증:** Bearer JWT

접근 가능한 서버 선택 목록입니다. 서버명·아이콘·owner·permissions는 이 응답에서 사용합니다. permissions는 큰 정수의 문자열이며 Number 변환을 피합니다.

**Path/query 입력:** 없음.

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<object>`

| 필드     | 타입                  | 필수 | 설명 |
| -------- | --------------------- | ---- | ---- |
| `guilds` | `Array<DiscordGuild>` | 예   | —    |

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "guilds": [
      {
        "id": "11928374659201928",
        "name": "데모데이 팀",
        "icon": null,
        "owner": true,
        "permissions": "32"
      }
    ]
  }
}
```

#### `POST /api/v1/auth/refresh`

**operationId:** `RefreshSession` · **인증:** Bearer JWT

**구현 보완:** 유효한 Bearer JWT가 필요합니다. refreshToken을 보내는 API가 아닙니다. 새 accessToken과 expiresAt으로 교체하고 서버 목록을 갱신합니다. 이미 만료된 JWT는 재로그인이 필요합니다.

**Path/query 입력:** 없음.

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<object>`

| 필드          | 타입     | 필수 | 설명 |
| ------------- | -------- | ---- | ---- |
| `expiresAt`   | `string` | 예   | —    |
| `tokenType`   | `string` | 예   | —    |
| `accessToken` | `string` | 예   | —    |

#### `POST /api/v1/auth/logout`

**operationId:** `LogoutSession` · **인증:** Bearer JWT

현재 세션을 삭제합니다. 응답 data는 null이고 FE도 토큰·사용자·서버별 캐시를 제거합니다.

**Path/query 입력:** 없음.

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<null>`

**타입:** `null`

### 3.2 Discord 연결 설정

#### `GET /api/v1/discord/channels`

**operationId:** `ListDiscordChannels` · **인증:** Bearer JWT

channels와 monitoredChannelIds를 조합해 isMonitored를 계산합니다. id/name/type/accessible를 사용합니다. **구현 보완:** type=0인 일반 텍스트 채널만 반환하며 접근 불가능한 저장된 선택은 해제할 수 있도록 표시합니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| query | `guildId` | 예   | `string`    | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<ChannelSettings>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "channels": [
      {
        "id": "11928374659201929",
        "guildId": "11928374659201928",
        "name": "의사결정-논의",
        "type": 0,
        "accessible": true
      }
    ],
    "monitoredChannelIds": ["11928374659201929"]
  }
}
```

#### `PUT /api/v1/discord/channels`

**operationId:** `SaveDiscordChannels` · **인증:** Bearer JWT

**구현 보완:** 서버 owner 또는 Manage Server 권한이 필요합니다. channelIds는 전체 선택을 교체합니다. 빈 배열은 모두 해제하며 중복 없이 최대 500개, 같은 서버에서 Bot이 읽을 수 있는 채널만 선택할 수 있습니다. 응답은 수정된 ChannelSettings입니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| query | `guildId` | 예   | `string`    | —      |

**Request Body** — 필수

| 필드         | 타입            | 필수 | 설명 |
| ------------ | --------------- | ---- | ---- |
| `channelIds` | `Array<string>` | 예   | —    |

**Response:** HTTP 200, `ApiResponse<ChannelSettings>`

**요청 예제**

```json
{
  "channelIds": ["11928374659201929", "11928374659201930"]
}
```

### 3.3 Dashboard·수동 동기화

#### `GET /api/v1/dashboard`

**operationId:** `GetDashboard` · **인증:** Bearer JWT

**구현 보완:** counts는 현재 CONFIRMED/ON_HOLD/IN_REVIEW만 집계합니다. 최근 결정은 현재 CONFIRMED 최대 5개이며 확인 시각이 없는 이전 데이터는 null을 유지합니다. sync.lastSuccessfulAt은 마지막 COMPLETED Job의 완료 시각입니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| query | `guildId` | 예   | `string`    | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<DashboardDto>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "counts": {
      "confirmed": 0,
      "onHold": 0,
      "inReview": 0
    },
    "recentDecisions": [],
    "sync": {
      "lastSuccessfulAt": null,
      "latestJob": null
    }
  }
}
```

#### `POST /api/v1/sync-jobs`

**operationId:** `Create` · **인증:** Bearer JWT

**구현 보완:** owner 또는 Manage Server 권한이 필요합니다. 최소 하나의 모니터링 채널이 필요하며 같은 서버의 미종료 동기화는 409입니다. 202는 작업 접수이며 완료가 아닙니다. forceFullSync=false는 기존 Checkpoint 이후, true는 전체 수집·명시적 재분석입니다. 추정 대기 시간은 반환하지 않습니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| query | `guildId` | 예   | `string`    | —      |

**Request Body** — 필수

| 필드            | 타입      | 필수   | 설명 |
| --------------- | --------- | ------ | ---- |
| `forceFullSync` | `boolean` | 아니오 | —    |

**Response:** HTTP 202, `ApiResponse<SyncJobView>`

**요청 예제**

```json
{
  "forceFullSync": false
}
```

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "jobId": "sync-example-001",
    "guildId": "11928374659201928",
    "forceFullSync": false,
    "status": "QUEUED",
    "totalChannels": 2,
    "completedChannels": 0,
    "failedChannels": 0,
    "decisionsFound": 0,
    "messagesScanned": 0,
    "errorMessage": null,
    "createdAt": "2026-10-13T10:00:00.000Z",
    "startedAt": null,
    "completedAt": null
  }
}
```

#### `GET /api/v1/sync-jobs/{jobId}`

**operationId:** `Get` · **인증:** Bearer JWT

jobId로 진행을 조회합니다. status는 구현상 QUEUED / PROCESSING / COMPLETED / FAILED입니다. 스펙 타입은 string입니다. 완료 또는 실패까지 polling하고 완료 후 Review Queue·Dashboard를 새로 조회합니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| path  | `jobId`   | 예   | `string`    | —      |
| query | `guildId` | 예   | `string`    | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<SyncJobView>`

### 3.4 Review Queue

#### `GET /api/v1/review-queue`

**operationId:** `ListV1ReviewQueue` · **인증:** Bearer JWT

status=IN_REVIEW는 검수 대기, ON_HOLD는 보류입니다. 한 요청으로 두 상태를 합쳐 조회하는 계약은 없으므로 필요하면 각각 조회합니다. items와 pageInfo를 사용하며 ticketId와 id는 같은 문자열 ID입니다.

| 위치  | 이름      | 필수   | 타입·허용값                | 기본값      |
| ----- | --------- | ------ | -------------------------- | ----------- |
| query | `guildId` | 예     | `string`                   | —           |
| query | `status`  | 아니오 | `"IN_REVIEW" \| "ON_HOLD"` | "IN_REVIEW" |
| query | `page`    | 아니오 | `number`                   | 1           |
| query | `size`    | 아니오 | `number`                   | 20          |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<V1ReviewQueueDto>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "items": [],
    "pageInfo": {
      "currentPage": 1,
      "pageSize": 20,
      "totalElements": 0,
      "totalPages": 0
    }
  }
}
```

#### `POST /api/v1/review-queue/{ticketId}/review`

**operationId:** `ReviewV1Candidate` · **인증:** Bearer JWT

confirm / defer / reject로 상태를 변경합니다. expectedVersion은 마지막 조회 버전인 양의 정수입니다. **구현 보완:** 승인자는 로그인 세션에서 결정되므로 approvedBy를 보내지 않습니다. confirm 기본 동작 또는 resolution=independent는 기존 결정에 영향을 주지 않습니다. replace는 predecessorId·predecessorVersion과 unfinished Action Item disposition이 필요합니다. 409에서는 재조회 후 다시 검수합니다.

| 위치  | 이름       | 필수 | 타입·허용값 | 기본값 |
| ----- | ---------- | ---- | ----------- | ------ |
| path  | `ticketId` | 예   | `string`    | —      |
| query | `guildId`  | 예   | `string`    | —      |

**Request Body** — 필수

| 필드                                | 타입                                                         | 필수              | 설명 |
| ----------------------------------- | ------------------------------------------------------------ | ----------------- | ---- |
| `title`                             | `string`                                                     | 아니오            | —    |
| `decisionContent`                   | `string`                                                     | 아니오            | —    |
| `rationale`                         | `string`                                                     | 아니오            | —    |
| `rationaleSummary`                  | `string`                                                     | 아니오            | —    |
| `rationaleQuotes`                   | `Array<string>`                                              | 아니오            | —    |
| `categoryTag`                       | `"타깃" \| "문제정의" \| "기능" \| "기술" \| "BM" \| "기타"` | 아니오            | —    |
| `expectedVersion`                   | `number`                                                     | 예                | —    |
| `resolution`                        | `"independent" \| "replace"`                                 | 아니오            | —    |
| `predecessorId`                     | `string`                                                     | 아니오            | —    |
| `predecessorVersion`                | `number`                                                     | 아니오            | —    |
| `taskDispositions`                  | `Array<object>`                                              | 아니오            | —    |
| `taskDispositions[].disposition`    | `"cancel" \| "transfer"`                                     | 아니오            | —    |
| `taskDispositions[].classification` | `"open" \| "completed"`                                      | 아니오            | —    |
| `taskDispositions[].actionItemId`   | `string`                                                     | 부모 제공 시 필수 | —    |
| `action`                            | `"confirm" \| "defer" \| "reject"`                           | 예                | —    |

**Response:** HTTP 200, `ApiResponse<V1DecisionDto>`

**요청 예제**

```json
{
  "action": "confirm",
  "expectedVersion": 1,
  "resolution": "independent"
}
```

**기존 결정 교체 예제** — predecessor와 candidate 모두 최신 버전을 조회한 상태입니다.

```json
{
  "action": "confirm",
  "expectedVersion": 1,
  "resolution": "replace",
  "predecessorId": "DEC-predecessor-example",
  "predecessorVersion": 3,
  "taskDispositions": [
    {
      "actionItemId": "action-open-example",
      "disposition": "transfer"
    },
    {
      "actionItemId": "action-unknown-example",
      "classification": "open",
      "disposition": "cancel"
    }
  ]
}
```

unknown Action Item은 open/completed로 먼저 분류합니다. unfinished 항목마다 cancel 또는 transfer를 선택합니다. 완료된 Action Item은 predecessor 이력에 남습니다. 이 변경은 두 Decision 상태와 함께 원자적으로 적용됩니다. 교체가 곧 전략적 Pivot을 의미하지는 않습니다. Draft 편집만으로 predecessor를 Superseded로 바꾸지 않습니다.

### 3.5 Decision Card 상세·편집·분석 이력

#### `GET /api/v1/decisions/{id}`

**operationId:** `GetV1Decision` · **인증:** Bearer JWT

전체 Decision Card를 조회합니다. category/status/alternatives/dates는 v1 필드를 사용합니다. source는 OpenAPI상 자유 객체이므로 아래의 구현 보완 필드 설명을 참고합니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| path  | `id`      | 예   | `string`    | —      |
| query | `guildId` | 예   | `string`    | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<V1DecisionDto>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "id": "DEC-example-001",
    "version": 1,
    "topic": "Authentication Provider",
    "title": "Discord 로그인 단일화",
    "decision": "Discord OAuth를 사용한다",
    "decisionContent": "MVP에서는 Discord OAuth만 사용한다",
    "rationale": "팀원이 사용하는 Discord 계정으로 온보딩을 단순화한다",
    "rationaleSummary": "온보딩 단순화",
    "rationaleQuotes": [],
    "state": "Decided",
    "status": "CONFIRMED",
    "category": "기술",
    "categoryTag": "기술",
    "confirmedDate": "2026-10-13T09:00:00.000Z",
    "createdAt": "2026-10-12T08:00:00.000Z",
    "updatedAt": "2026-10-13T09:00:00.000Z",
    "dates": {
      "createdDate": "2026-10-12T08:00:00.000Z",
      "confirmedDate": "2026-10-13T09:00:00.000Z",
      "feedbackDate": null
    },
    "alternatives": [
      {
        "id": "alt-example-001",
        "name": "자체 회원가입",
        "reason": "계정 관리 비용"
      }
    ],
    "actionItems": [
      {
        "id": "action-example-001",
        "task": "OAuth 연동",
        "state": "open",
        "assignee": "팀원 A"
      }
    ],
    "source": {
      "guildId": "11928374659201928",
      "channelId": "11928374659201929",
      "channelName": "의사결정-논의",
      "triggerMessageId": "129481928470",
      "messageUrl": "https://discord.com/channels/11928374659201928/11928374659201929/129481928470",
      "participants": ["팀원 A"],
      "rawMessages": []
    }
  }
}
```

#### `PUT /api/v1/decisions/{id}`

**operationId:** `EditV1Decision` · **인증:** Bearer JWT

부분 수정이 아닌 전체 편집 입력을 보냅니다. title·decision·rationale·category·alternatives·expectedVersion이 필수입니다. **구현 보완:** Superseded/Rejected는 편집 불가입니다. status/state/summary/decisionContent 등 추가 필드는 거절합니다. 응답은 id/updatedAt만이 아니라 전체 V1DecisionDto입니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| path  | `id`      | 예   | `string`    | —      |
| query | `guildId` | 예   | `string`    | —      |

**Request Body** — 필수

| 필드                    | 타입                                                         | 필수              | 설명                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------ | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `expectedVersion`       | `number`                                                     | 예                | Version last read; stale edits return 409.                                                                                               |
| `title`                 | `string`                                                     | 예                | Required summary, 1–200 trimmed characters.                                                                                              |
| `decision`              | `string`                                                     | 예                | Required decision content, 1–10000 trimmed characters.                                                                                   |
| `rationale`             | `string`                                                     | 예                | Rationale required; empty means not stated, max 10000 characters.                                                                        |
| `category`              | `"타깃" \| "문제정의" \| "기능" \| "기술" \| "BM" \| "기타"` | 예                | —                                                                                                                                        |
| `alternatives`          | `Array<object>`                                              | 예                | Full replacement (max 20). Keep existing IDs, omit ID to add; omitted existing alternatives are deleted. Unknown/duplicate IDs rejected. |
| `alternatives[].reason` | `string`                                                     | 부모 제공 시 필수 | —                                                                                                                                        |
| `alternatives[].name`   | `string`                                                     | 부모 제공 시 필수 | —                                                                                                                                        |
| `alternatives[].id`     | `string`                                                     | 아니오            | —                                                                                                                                        |

**Response:** HTTP 200, `ApiResponse<V1DecisionDto>`

**요청 예제**

```json
{
  "expectedVersion": 1,
  "title": "Discord 로그인 단일화",
  "decision": "MVP에서는 Discord OAuth를 사용한다",
  "rationale": "팀원의 온보딩 단순화",
  "category": "기술",
  "alternatives": [
    {
      "id": "alt-example-001",
      "name": "자체 회원가입",
      "reason": "계정 관리 비용"
    }
  ]
}
```

title은 trim 후 1–200자, decision은 1–10000자, rationale은 0–10000자이며 빈 값은 근거 미언급입니다. alternatives는 최대 20개이며 name 1–200자, reason 0–2000자입니다. 기존 대안은 조회받은 id를 유지하고 새 대안은 id를 생략합니다. 전체 교체이므로 요청에서 빠진 기존 대안은 삭제됩니다. 알 수 없는 id나 중복 id는 거절합니다.

#### `GET /api/v1/decisions/{id}/history`

**operationId:** `GetV1DecisionHistory` · **인증:** Bearer JWT

Decision Candidate와 관련된 Analysis Request / 재분석 이력입니다. 편집 버전 전체의 스냅샷 목록은 아닙니다. previousRequestIds와 relatedCandidateIds로 연관 분석·후보를 표시할 수 있습니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| path  | `id`      | 예   | `string`    | —      |
| query | `guildId` | 예   | `string`    | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<Array<CandidateHistoryEntry>>`

**타입:** `Array<CandidateHistoryEntry>`

### 3.6 Decision Card 전체 목록

#### `GET /api/v1/decisions`

**operationId:** `ListV1Decisions` · **인증:** Bearer JWT

FE는 data.items를 사용합니다. data.decisions는 기존 호환용 투영입니다. **구현 보완:** 최신 생성 시각 순, 동일 시각은 ID 오름차순입니다. status가 state보다 우선하며 category가 categoryTag보다 우선합니다. 현재 상태 필터는 status, 카테고리는 category 사용을 권장합니다.

| 위치  | 이름          | 필수   | 타입·허용값      | 기본값 |
| ----- | ------------- | ------ | ---------------- | ------ |
| query | `guildId`     | 예     | `string`         | —      |
| query | `topic`       | 아니오 | `string`         | —      |
| query | `state`       | 아니오 | `string`         | —      |
| query | `categoryTag` | 아니오 | `string`         | —      |
| query | `status`      | 아니오 | `DecisionStatus` | —      |
| query | `category`    | 아니오 | `string`         | —      |
| query | `page`        | 아니오 | `number`         | 1      |
| query | `size`        | 아니오 | `number`         | 20     |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<V1DecisionListDto>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "items": [],
    "decisions": [],
    "pageInfo": {
      "currentPage": 1,
      "pageSize": 20,
      "totalElements": 0,
      "totalPages": 0
    }
  }
}
```

### 3.7 Why 검색

#### `GET /api/v1/search`

**operationId:** `SearchDecisions` · **인증:** Bearer JWT

query가 자연어 질문이며 q가 아닙니다. data.items의 각 항목은 decision·score·excerpt·sourceUrl입니다. **구현 보완:** 현재 CONFIRMED와 SUPERSEDED만 검색합니다. query는 공백 제외 1–1000자, limit은 1–50입니다. 별도 External Feedback 검색 endpoint는 없습니다. 임베딩 공급자 실패는 503으로 표시될 수 있습니다.

| 위치  | 이름      | 필수   | 타입·허용값 | 기본값 |
| ----- | --------- | ------ | ----------- | ------ |
| query | `guildId` | 예     | `string`    | —      |
| query | `query`   | 예     | `string`    | —      |
| query | `limit`   | 아니오 | `number`    | 10     |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<SearchResponse>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "items": [
      {
        "decision": {
          "id": "DEC-example-001",
          "version": 1,
          "topic": "Authentication Provider",
          "title": "Discord 로그인 단일화",
          "decision": "Discord OAuth를 사용한다",
          "decisionContent": "MVP에서는 Discord OAuth만 사용한다",
          "rationale": "팀원이 사용하는 Discord 계정으로 온보딩을 단순화한다",
          "rationaleSummary": "온보딩 단순화",
          "rationaleQuotes": [],
          "state": "Decided",
          "status": "CONFIRMED",
          "category": "기술",
          "categoryTag": "기술",
          "confirmedDate": "2026-10-13T09:00:00.000Z",
          "createdAt": "2026-10-12T08:00:00.000Z",
          "updatedAt": "2026-10-13T09:00:00.000Z",
          "dates": {
            "createdDate": "2026-10-12T08:00:00.000Z",
            "confirmedDate": "2026-10-13T09:00:00.000Z",
            "feedbackDate": null
          },
          "alternatives": [
            {
              "id": "alt-example-001",
              "name": "자체 회원가입",
              "reason": "계정 관리 비용"
            }
          ],
          "actionItems": [
            {
              "id": "action-example-001",
              "task": "OAuth 연동",
              "state": "open",
              "assignee": "팀원 A"
            }
          ],
          "source": {
            "guildId": "11928374659201928",
            "channelId": "11928374659201929",
            "channelName": "의사결정-논의",
            "triggerMessageId": "129481928470",
            "messageUrl": "https://discord.com/channels/11928374659201928/11928374659201929/129481928470",
            "participants": ["팀원 A"],
            "rawMessages": []
          }
        },
        "score": 0.94,
        "excerpt": "Discord 계정으로 온보딩을 단순화한다",
        "sourceUrl": "https://discord.com/channels/11928374659201928/11928374659201929/129481928470"
      }
    ]
  }
}
```

### 3.8 Decision Timeline

#### `GET /api/v1/decisions/timeline`

**operationId:** `GetDecisionTimeline` · **인증:** Bearer JWT

**구현 보완:** groupBy 기본값은 month입니다. 확인 날짜가 있는 현재 CONFIRMED만 포함합니다. from은 포함, to는 미포함인 ISO 8601 시각이며 timezone은 IANA 이름입니다. groupBy=channel의 key는 channelId입니다. 응답 groups[].key/count/items를 화면 라벨로 가공합니다.

| 위치  | 이름       | 필수   | 타입·허용값               | 기본값 |
| ----- | ---------- | ------ | ------------------------- | ------ |
| query | `guildId`  | 예     | `string`                  | —      |
| query | `groupBy`  | 아니오 | `DecisionTimelineGroupBy` | —      |
| query | `timezone` | 아니오 | `string`                  | "UTC"  |
| query | `from`     | 아니오 | `string`                  | —      |
| query | `to`       | 아니오 | `string`                  | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<DecisionTimelineDto>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "groupBy": "month",
    "timezone": "Asia/Seoul",
    "totalElements": 0,
    "groups": []
  }
}
```

월 그룹 key는 `2026-10` 같은 값입니다. FE가 “2026년 10월”로 표시합니다. timezone 변경은 월 경계에 영향을 줍니다. from/to가 있으면 유효한 ISO 8601 timestamp여야 하며 from < to입니다. 확인 날짜가 없는 이전 Decision은 일반 목록에서 조회하고 Timeline에는 나오지 않습니다.

### 3.9 분석 실패·재시도

#### `GET /api/v1/analysis-deliveries`

**operationId:** `ListAnalysisDeliveries` · **인증:** Bearer JWT

Bot이 동기화한 Analysis Request 상태입니다. available=false일 때 실시간 제어가 가능한 것처럼 표시하지 않고 마지막 동기화 시각을 보여줍니다. **구현 보완:** heartbeat와 요청 상태의 유효성 기준은 15초입니다.

| 위치  | 이름      | 필수 | 타입·허용값 | 기본값 |
| ----- | --------- | ---- | ----------- | ------ |
| query | `guildId` | 예   | `string`    | —      |

**Request Body:** 없음.

**Response:** HTTP 200, `ApiResponse<AnalysisDeliveryQueueDto>`

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "requests": [
      {
        "requestId": "analysis-example-001",
        "guildId": "11928374659201928",
        "channelId": "11928374659201929",
        "status": "retained-failure",
        "attempts": 5,
        "nextAttemptAt": 0,
        "errorCategory": "backend-unavailable",
        "lastError": "Backend AI returned status 503",
        "synchronizedAt": "2026-10-13T10:00:00.000Z"
      }
    ],
    "available": true,
    "lastSynchronizedAt": "2026-10-13T10:00:00.000Z"
  }
}
```

#### `POST /api/v1/analysis-deliveries/{requestId}/retry`

**operationId:** `RetryAnalysisRequest` · **인증:** Bearer JWT

**구현 보완:** owner 또는 Manage Server 권한이 필요합니다. 최신 상태의 retained-failure만 재시도할 수 있습니다. commandId는 새 명령에 새 UUID를 사용하고, 같은 명령의 HTTP 재전송에는 같은 값을 유지합니다. 202와 acknowledgedAt은 접수·Bot 수신을 뜻하며 AI 분석 완료는 별도 queue 상태로 확인합니다. requiresNewAnalysis=true인 terminal 분석은 같은 요청 retry가 거절되므로 새 수동 분석을 요청합니다.

| 위치  | 이름        | 필수 | 타입·허용값 | 기본값 |
| ----- | ----------- | ---- | ----------- | ------ |
| query | `guildId`   | 예   | `string`    | —      |
| path  | `requestId` | 예   | `string`    | —      |

**Request Body** — 필수

| 필드        | 타입     | 필수 | 설명 |
| ----------- | -------- | ---- | ---- |
| `commandId` | `string` | 예   | —    |

**Response:** HTTP 202, `ApiResponse<AnalysisRetryCommandDto>`

**요청 예제**

```json
{
  "commandId": "example-command-uuid"
}
```

**응답 예제**

```json
{
  "success": true,
  "code": "OK",
  "message": "Success",
  "data": {
    "id": "example-command-uuid",
    "requestId": "analysis-example-001",
    "guildId": "11928374659201928",
    "createdAt": "2026-10-13T10:00:00.000Z",
    "acknowledgedAt": null
  }
}
```

<a id="models"></a>

## 4. 공통 데이터 모델

### 4.1 Decision Status와 Decision State

| v1 status  | 기존 state                    | 의미                      |
| ---------- | ----------------------------- | ------------------------- |
| IN_REVIEW  | Draft / Proposed / Discussing | 검수 대기                 |
| CONFIRMED  | Decided                       | 확정 Decision Record      |
| ON_HOLD    | Deferred                      | 보류 Decision Candidate   |
| DISCARDED  | Rejected                      | 폐기                      |
| SUPERSEDED | Superseded                    | 다른 결정으로 교체된 이력 |

카테고리 입력은 `타깃`, `문제정의`, `기능`, `기술`, `BM`, `기타`입니다. 초안의 `아키텍처`, `인프라`, `AI/LLM`, `기획/정책`은 현재 입력 enum이 아닙니다. 오래된 데이터에 다른 문자열이 남아 있을 수 있으므로 읽기 화면에는 fallback을 둡니다.

### V1DecisionDto

| 필드                    | 타입                                                                                             | 필수              | 설명 |
| ----------------------- | ------------------------------------------------------------------------------------------------ | ----------------- | ---- |
| `id`                    | `string`                                                                                         | 예                | —    |
| `version`               | `number`                                                                                         | 아니오            | —    |
| `supersededById`        | `string`                                                                                         | 아니오            | —    |
| `topic`                 | `string`                                                                                         | 예                | —    |
| `decision`              | `string`                                                                                         | 예                | —    |
| `title`                 | `string`                                                                                         | 아니오            | —    |
| `decisionContent`       | `string`                                                                                         | 아니오            | —    |
| `rationale`             | `string`                                                                                         | 예                | —    |
| `rationaleSummary`      | `string`                                                                                         | 아니오            | —    |
| `rationaleQuotes`       | `Array<string>`                                                                                  | 아니오            | —    |
| `categoryTag`           | `"타깃" \| "문제정의" \| "기능" \| "기술" \| "BM" \| "기타"`                                     | 아니오            | —    |
| `actionItems`           | `Array<ActionItemDto>`                                                                           | 아니오            | —    |
| `state`                 | `"Draft" \| "Proposed" \| "Discussing" \| "Decided" \| "Superseded" \| "Deferred" \| "Rejected"` | 예                | —    |
| `supersedesId`          | `string`                                                                                         | 아니오            | —    |
| `isPivot`               | `boolean`                                                                                        | 아니오            | —    |
| `approvedBy`            | `string`                                                                                         | 아니오            | —    |
| `decisionConfirmedDate` | `string`                                                                                         | 아니오            | —    |
| `feedbackSourceType`    | `string`                                                                                         | 아니오            | —    |
| `feedbackSourceDetail`  | `string`                                                                                         | 아니오            | —    |
| `feedbackReceivedDate`  | `string`                                                                                         | 아니오            | —    |
| `rawEvidence`           | `Array<string>`                                                                                  | 아니오            | —    |
| `evidenceHash`          | `string`                                                                                         | 아니오            | —    |
| `rawTranscript`         | `string`                                                                                         | 아니오            | —    |
| `source`                | `Record<string, unknown>`                                                                        | 아니오            | —    |
| `messageCreatedAt`      | `string`                                                                                         | 아니오            | —    |
| `createdAt`             | `string`                                                                                         | 예                | —    |
| `governanceScore`       | `number`                                                                                         | 아니오            | —    |
| `governanceReason`      | `string`                                                                                         | 아니오            | —    |
| `governancePassed`      | `boolean`                                                                                        | 아니오            | —    |
| `updatedAt`             | `string`                                                                                         | 아니오            | —    |
| `status`                | `DecisionStatus`                                                                                 | 예                | —    |
| `category`              | `string`                                                                                         | 예                | —    |
| `confirmedDate`         | `string \| null`                                                                                 | 예                | —    |
| `dates`                 | `object`                                                                                         | 예                | —    |
| `dates.feedbackDate`    | `string \| null`                                                                                 | 예                | —    |
| `dates.confirmedDate`   | `string \| null`                                                                                 | 예                | —    |
| `dates.createdDate`     | `string`                                                                                         | 예                | —    |
| `alternatives`          | `Array<object>`                                                                                  | 예                | —    |
| `alternatives[].reason` | `string`                                                                                         | 부모 제공 시 필수 | —    |
| `alternatives[].name`   | `string`                                                                                         | 부모 제공 시 필수 | —    |
| `alternatives[].id`     | `string`                                                                                         | 부모 제공 시 필수 | —    |

**화면 매핑:** summary 대신 title(없으면 topic), 본문은 decisionContent(없으면 decision), 근거는 rationaleSummary(없으면 rationale), 대안의 폐기 이유는 reason입니다. updatedAt은 최상위 필드이며 dates.updatedAt은 없습니다. `V1ReviewTicketDto`는 이 모델에 필수 ticketId를 추가한 형태입니다.

**source 구현 보완:** guildId/channelId/triggerMessageId, 선택적인 channelName/messageUrl, participants와 rawMessages를 포함할 수 있습니다. authorName 단일 필드는 정의하지 않습니다. 원본 메시지의 author를 쓰거나 participants를 별도로 표시합니다. source는 Swagger상 자유 객체이므로 모든 중첩 필드를 항상 존재한다고 가정하지 않습니다.

**버전:** Swagger는 version을 optional로 표시하지만 편집·검수 요청의 expectedVersion은 필수입니다. 현재 저장된 Decision은 version을 포함합니다. 임의로 1을 채우지 말고 최신 조회 값을 전달합니다.

### ActionItemDto

| 필드                          | 타입                                                                | 필수   | 설명 |
| ----------------------------- | ------------------------------------------------------------------- | ------ | ---- |
| `id`                          | `string`                                                            | 아니오 | —    |
| `state`                       | `"unknown" \| "open" \| "completed" \| "canceled" \| "transferred"` | 아니오 | —    |
| `transferredFromDecisionId`   | `string`                                                            | 아니오 | —    |
| `transferredFromActionItemId` | `string`                                                            | 아니오 | —    |
| `transferredToDecisionId`     | `string`                                                            | 아니오 | —    |
| `task`                        | `string`                                                            | 예     | —    |
| `assignee`                    | `string`                                                            | 아니오 | —    |
| `dueDate`                     | `string`                                                            | 아니오 | —    |

### CandidateHistoryEntry

| 필드                  | 타입            | 필수 | 설명 |
| --------------------- | --------------- | ---- | ---- |
| `requestId`           | `string`        | 예   | —    |
| `isManualOverride`    | `boolean`       | 예   | —    |
| `previousRequestIds`  | `Array<string>` | 예   | —    |
| `relatedCandidateIds` | `Array<string>` | 예   | —    |
| `createdAt`           | `string`        | 예   | —    |

### AuthUserDto

| 필드            | 타입             | 필수 | 설명 |
| --------------- | ---------------- | ---- | ---- |
| `id`            | `string`         | 예   | —    |
| `name`          | `string`         | 예   | —    |
| `email`         | `string \| null` | 예   | —    |
| `avatarUrl`     | `string \| null` | 예   | —    |
| `discordUserId` | `string`         | 예   | —    |

### DiscordGuild

| 필드          | 타입             | 필수 | 설명 |
| ------------- | ---------------- | ---- | ---- |
| `id`          | `string`         | 예   | —    |
| `name`        | `string`         | 예   | —    |
| `icon`        | `string \| null` | 예   | —    |
| `owner`       | `boolean`        | 예   | —    |
| `permissions` | `string`         | 예   | —    |

### DiscordChannel

| 필드         | 타입      | 필수 | 설명 |
| ------------ | --------- | ---- | ---- |
| `id`         | `string`  | 예   | —    |
| `guildId`    | `string`  | 예   | —    |
| `name`       | `string`  | 예   | —    |
| `type`       | `number`  | 예   | —    |
| `accessible` | `boolean` | 예   | —    |

### ChannelSettings

| 필드                  | 타입                    | 필수 | 설명 |
| --------------------- | ----------------------- | ---- | ---- |
| `channels`            | `Array<DiscordChannel>` | 예   | —    |
| `monitoredChannelIds` | `Array<string>`         | 예   | —    |

### DashboardDto

| 필드                               | 타입                   | 필수 | 설명 |
| ---------------------------------- | ---------------------- | ---- | ---- |
| `counts`                           | `object`               | 예   | —    |
| `counts.inReview`                  | `number`               | 예   | —    |
| `counts.onHold`                    | `number`               | 예   | —    |
| `counts.confirmed`                 | `number`               | 예   | —    |
| `recentDecisions`                  | `Array<V1DecisionDto>` | 예   | —    |
| `sync`                             | `object`               | 예   | —    |
| `sync.latestJob`                   | `object \| null`       | 예   | —    |
| `sync.latestJob.completedAt`       | `string \| null`       | 예   | —    |
| `sync.latestJob.createdAt`         | `string`               | 예   | —    |
| `sync.latestJob.failedChannels`    | `number`               | 예   | —    |
| `sync.latestJob.completedChannels` | `number`               | 예   | —    |
| `sync.latestJob.totalChannels`     | `number`               | 예   | —    |
| `sync.latestJob.errorMessage`      | `string \| null`       | 예   | —    |
| `sync.latestJob.status`            | `string`               | 예   | —    |
| `sync.latestJob.jobId`             | `string`               | 예   | —    |
| `sync.lastSuccessfulAt`            | `string \| null`       | 예   | —    |

### SyncJobView

| 필드                | 타입             | 필수 | 설명 |
| ------------------- | ---------------- | ---- | ---- |
| `completedAt`       | `string \| null` | 예   | —    |
| `startedAt`         | `string \| null` | 예   | —    |
| `createdAt`         | `string`         | 예   | —    |
| `errorMessage`      | `string \| null` | 예   | —    |
| `messagesScanned`   | `number`         | 예   | —    |
| `decisionsFound`    | `number`         | 예   | —    |
| `failedChannels`    | `number`         | 예   | —    |
| `completedChannels` | `number`         | 예   | —    |
| `totalChannels`     | `number`         | 예   | —    |
| `status`            | `string`         | 예   | —    |
| `forceFullSync`     | `boolean`        | 예   | —    |
| `guildId`           | `string`         | 예   | —    |
| `jobId`             | `string`         | 예   | —    |

### SearchResult

| 필드        | 타입             | 필수 | 설명 |
| ----------- | ---------------- | ---- | ---- |
| `decision`  | `V1DecisionDto`  | 예   | —    |
| `score`     | `number`         | 예   | —    |
| `excerpt`   | `string`         | 예   | —    |
| `sourceUrl` | `string \| null` | 예   | —    |

### SearchResponse

| 필드    | 타입                  | 필수 | 설명 |
| ------- | --------------------- | ---- | ---- |
| `items` | `Array<SearchResult>` | 예   | —    |

### DecisionTimelineDto

| 필드             | 타입                      | 필수              | 설명 |
| ---------------- | ------------------------- | ----------------- | ---- |
| `groupBy`        | `DecisionTimelineGroupBy` | 예                | —    |
| `timezone`       | `string`                  | 예                | —    |
| `totalElements`  | `number`                  | 예                | —    |
| `groups`         | `Array<object>`           | 예                | —    |
| `groups[].items` | `Array<V1DecisionDto>`    | 부모 제공 시 필수 | —    |
| `groups[].count` | `number`                  | 부모 제공 시 필수 | —    |
| `groups[].key`   | `string`                  | 부모 제공 시 필수 | —    |

### AnalysisDeliveryQueueDto

| 필드                 | 타입                             | 필수 | 설명 |
| -------------------- | -------------------------------- | ---- | ---- |
| `requests`           | `Array<AnalysisDeliveryViewDto>` | 예   | —    |
| `available`          | `boolean`                        | 예   | —    |
| `lastSynchronizedAt` | `string \| null`                 | 예   | —    |

### AnalysisDeliveryViewDto

| 필드                       | 타입                                                                                                           | 필수              | 설명 |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------- | ---- |
| `requestId`                | `string`                                                                                                       | 예                | —    |
| `guildId`                  | `string`                                                                                                       | 예                | —    |
| `channelId`                | `string`                                                                                                       | 예                | —    |
| `channelName`              | `string`                                                                                                       | 아니오            | —    |
| `status`                   | `"pending" \| "retry-pending" \| "retained-failure" \| "completed-with-candidates" \| "completed-no-decision"` | 예                | —    |
| `attempts`                 | `number`                                                                                                       | 예                | —    |
| `nextAttemptAt`            | `number`                                                                                                       | 예                | —    |
| `errorCategory`            | `string`                                                                                                       | 아니오            | —    |
| `lastError`                | `string`                                                                                                       | 아니오            | —    |
| `scanRange`                | `object`                                                                                                       | 아니오            | —    |
| `scanRange.endMessageId`   | `string`                                                                                                       | 부모 제공 시 필수 | —    |
| `scanRange.startMessageId` | `string`                                                                                                       | 부모 제공 시 필수 | —    |
| `scanRange.afterMessageId` | `string`                                                                                                       | 부모 제공 시 필수 | —    |
| `synchronizedAt`           | `string`                                                                                                       | 예                | —    |

nextAttemptAt은 구현상 Unix epoch milliseconds입니다. 재시도 일정이 없는 경우 0일 수 있으므로 항상 날짜로 표시하지 않습니다. pending=대기, retry-pending=자동 재시도 대기, retained-failure=사용자 개입 필요, completed-with-candidates=후보 저장 완료, completed-no-decision=후보 없는 정상 완료입니다.

### AnalysisRetryCommandDto

| 필드             | 타입             | 필수 | 설명 |
| ---------------- | ---------------- | ---- | ---- |
| `id`             | `string`         | 예   | —    |
| `requestId`      | `string`         | 예   | —    |
| `guildId`        | `string`         | 예   | —    |
| `createdAt`      | `string`         | 예   | —    |
| `acknowledgedAt` | `string \| null` | 예   | —    |

<a id="errors"></a>

## 5. 오류 처리 — 구현 보완

Swagger에는 대부분 성공 응답만 선언되어 있어 아래 내용은 현재 error handler·Service 기준입니다. 초안의 AUTH_4010·SYNC_4091·DECISION_4041 등 세분화 코드는 현재 반환하지 않습니다. 메시지 문자열에 화면 로직을 결합하지 말고 HTTP 상태와 code를 우선 사용합니다.

| HTTP | code                              | 대표 상황                                                             | FE 처리                                         |
| ---- | --------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------- |
| 400  | VALIDATION_ERROR 또는 BAD_REQUEST | 필수 값·enum·형식·범위 오류                                           | 입력 오류 표시; 가능하면 data의 필드 오류 사용  |
| 401  | UNAUTHORIZED                      | 토큰 누락·만료·삭제된 세션, 잘못된 OAuth state                        | 토큰 제거 후 로그인 흐름 재시작                 |
| 403  | FORBIDDEN                         | guild 접근 없음, Manage Server 권한 부족, 다른 서버의 카드            | 선택 서버·권한 안내, 다른 서버 데이터 표시 금지 |
| 404  | NOT_FOUND                         | Decision / Candidate / Job / Analysis Request 없음                    | 해당 항목 미존재 표시                           |
| 409  | CONFLICT                          | stale version, 이미 처리된 후보, 중복 동기화, stale queue·재시도 불가 | 상황별 재조회·대기·다시 검수                    |
| 429  | RATE_LIMITED                      | 요청 제한                                                             | 즉시 반복 요청 중단, 이후 다시 시도             |
| 5xx  | INTERNAL_ERROR                    | DB·외부 공급자·미처리 오류                                            | 실패 상태 표시, 사용자 재시도 제공              |

검수·편집의 409는 자동으로 최신 버전을 대입해 같은 승인을 반복하지 않습니다. candidate와 predecessor를 다시 읽고 사용자가 변경 내용을 재확인해야 합니다. 동기화의 409는 새 Job을 계속 만들지 않고 기존 진행 상태를 확인합니다. retry API의 202를 받은 뒤에도 분석이 완료됐다는 안내는 queue의 실제 완료 상태 이후에 합니다.

<a id="refresh"></a>

## 6. 화면 갱신 권장 흐름

| 이벤트            | 다시 조회할 데이터                                              |
| ----------------- | --------------------------------------------------------------- |
| 서버 변경         | 서버별 목록·Review Queue·Dashboard·Timeline·채널 설정·실패 목록 |
| 검수 성공         | Review Queue, Decision 목록·상세, Dashboard, Timeline           |
| 카드 편집 성공    | 카드 상세·목록, Dashboard, Timeline, 필요 시 검색 결과          |
| 채널 설정 저장    | channels의 monitoredChannelIds                                  |
| Sync Job 접수     | 해당 jobId 상태 및 Dashboard                                    |
| Sync Job terminal | Dashboard, Review Queue, Decision 목록·Timeline                 |
| 재시도 명령 접수  | AnalysisDeliveryQueue와 해당 requestId의 상태                   |

Job polling은 진행 중에만 수행하고 terminal에서 중단합니다. interval은 화면 요구에 맞게 정하되 HTTP 429와 연결 실패 시 backoff를 둡니다. available=false의 queue를 빈 상태·분석 성공으로 해석하지 않습니다.

<a id="caveats"></a>

## 7. FE 연동 시 스펙에서 주의할 부분

1. 보안 scheme에는 현재 jwt만 선언돼 있지만 일부 경로는 service를 참조합니다. 해당 경로는 Bot 전용입니다. BOT_SERVICE_TOKEN을 브라우저에 전달하지 않습니다.
2. 오류 응답 대부분이 Swagger responses에 선언되지 않았습니다. 위 공통 오류 처리를 구현합니다.
3. V1DecisionDto의 상속된 일부 필드는 Swagger에서 optional string으로 보이지만 실제 이전 도메인 데이터는 null을 반환할 수 있습니다. supersedesId/supersededById/approvedBy/decisionConfirmedDate/feedbackSourceType/feedbackSourceDetail/feedbackReceivedDate 등을 화면에서 null-safe하게 처리합니다. 명확히 nullable인 confirmedDate/dates 필드와 혼동하지 않습니다.
4. DecisionEditDto의 additionalProperties는 Swagger에서 열려 있지만 실제 편집 검증은 strict입니다. 문서에 없는 status/state/summary 등을 보내면 400입니다.
5. groupBy 기본값은 현재 Swagger에 명시되지 않았지만 구현은 month입니다. 명시적으로 전달하면 클라이언트 의도가 분명해집니다.
6. source는 자유 객체이고 SyncJobView.status는 string입니다. 현재 구현의 필드·상태를 사용하되 앱에서 알려지지 않은 값의 fallback을 준비합니다.
7. Why 검색은 별도의 OpenAI 임베딩 설정을 사용합니다. 추출 provider=Gemini가 설정됐다는 사실만으로 검색이 동작한다고 보장하지 않습니다. 검색 공급자 오류는 FE에서 처리해야 합니다.

<a id="appendix"></a>

## 8. 부록 — FE 기본 연동 밖의 API

### 8.1 Bot·내부 API

아래 9개는 service Bearer 인증이 필요합니다. FE는 대응하는 v1 사용자 API를 사용합니다. 현재 Swagger의 service scheme 정의 누락은 스펙 보완 대상입니다.

| Method | 경로                                                    | 용도                                      | 성공 |
| ------ | ------------------------------------------------------- | ----------------------------------------- | ---- |
| `POST` | `/api/v1/internal/sync-jobs/claim`                      | Bot Job 획득                              | 200  |
| `PUT`  | `/api/v1/internal/sync-jobs/{jobId}`                    | owner·채널 결과·임대 갱신                 | 200  |
| `GET`  | `/api/discussions/history/{decisionId}`                 | 분석 이력                                 | 200  |
| `POST` | `/api/discussions/analyze`                              | Discussion Context AI 분석                | 200  |
| `GET`  | `/api/channels/{channelId}/checkpoint`                  | Scan Range 연속 완료 Checkpoint 조회·저장 | 200  |
| `POST` | `/api/channels/{channelId}/checkpoint`                  | Scan Range 연속 완료 Checkpoint 조회·저장 | 200  |
| `GET`  | `/api/v1/internal/monitoring`                           | 읽기 가능한 모니터링 채널                 | 200  |
| `POST` | `/api/v1/internal/analysis-deliveries/sync`             | queue 상태·heartbeat 동기화               | 200  |
| `POST` | `/api/v1/internal/analysis-deliveries/retries/{id}/ack` | 재시도 명령 수신 확인                     | 200  |

### 8.2 정책·기존 피드백 API

| Method | 경로                 | 입력                                                    | 성공 응답                                          |
| ------ | -------------------- | ------------------------------------------------------- | -------------------------------------------------- |
| GET    | `/api/config/policy` | 없음                                                    | HTTP 200, HarvestingPolicyDto 직접 반환            |
| GET    | `/api/feedbacks`     | channelId?, limit? query                                | HTTP 200, `{feedbacks: ExternalFeedbackItemDto[]}` |
| POST   | `/api/feedbacks`     | id/source/content/channelId/createdAt 필수, detail 선택 | HTTP 201, `{id, status}`                           |

Swagger에는 위 3개가 공개로 선언되어 있습니다. 현재 피드백 API는 guild 범위 인증형 v1 계약이 아니고 FE의 서버별 Feedback Board 호출은 준비 중입니다. 원본 피드백 검색이나 서버별 피드백 등록이 필요하면 별도 BE 계약을 합의해야 합니다. 목록에 있다는 이유만으로 v1 사용자 흐름에 그대로 연결하지 않습니다.

## 9. 문서 갱신과 근거

- 경로·operationId·성공 상태·필드 계약: [swagger.json](../../apps/be/src/api/docs/swagger.json)
- 인증·OAuth: [인증 설명](../../apps/be/AUTH.md), [AuthController](../../apps/be/src/api/controllers/auth.controller.ts), [AuthService](../../apps/be/src/services/auth.service.ts)
- 상태·조회: [Decision 읽기 모델](../model/decision-read.md)
- 편집 제약: [Decision 편집 모델](../model/decision-edit.md)
- Timeline: [Timeline 모델](../model/decision-timeline.md)
- Dashboard: [Dashboard 모델](../model/dashboard-summary.md)
- 실패·재시도: [AnalysisDeliveryService](../../apps/be/src/services/analysis-delivery.service.ts)
- 공통 오류: [errorHandler](../../apps/be/src/api/middlewares/errorHandler.ts)

Swagger 갱신 시 이 문서의 경로·표·예제를 같이 검토합니다. HTTP 정상 응답과 schema 예제가 일치하는 것, 실제 OAuth/Discord/AI 계정 연결과 모델 품질이 검증된 것은 서로 별개의 확인입니다.
