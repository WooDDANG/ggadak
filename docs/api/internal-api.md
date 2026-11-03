# Bot·내부·기존 API

[API 문서 안내](README.md) · [FE 계약](frontend-api.md) · [분석·그래프](agentic-analysis.md)

이 페이지는 Bot/BE 연동용입니다. 실제 FE는 서버 membership을 확인하는 사용자 v1 API를 사용합니다.
경로·입출력 필드의 기준은 [swagger.json](../../apps/be/src/api/docs/swagger.json)입니다.

<a id="service"></a>

## 서비스 인증 API

아래 경로는 구현의 `@Security('service')`에 따라 `Authorization: Bearer <BOT_SERVICE_TOKEN>`이 필요합니다.
이 토큰은 Bot과 BE 사이의 서비스 자격증명이며 브라우저에 전달하지 않습니다.
현재 Swagger는 각 경로에서 `service`를 참조하지만 `components.securitySchemes`에는 jwt만
정의하고 있습니다. 이 문서는 누락을 설명하며 스키마 자체를 보완한 것은 아닙니다.

목록 기준: 2026-11-03, 서비스 API 19개. 스펙 SHA-256: `b786ef92bb1e0f57b23c121ced1025c002631ebd97c1238e6d4a3450a42e1967`.

| Method | 경로 | 성공 HTTP | operationId |
| --- | --- | --- | --- |
| `POST` | `/api/v1/internal/sync-jobs/claim` | 200 | `Claim` |
| `PUT` | `/api/v1/internal/sync-jobs/{jobId}` | 200 | `Update` |
| `POST` | `/api/v1/internal/guild-access/events` | 200 | `Observe` |
| `GET` | `/api/feedbacks` | 200 | `ListFeedbacks` |
| `POST` | `/api/feedbacks` | 201 | `CreateFeedback` |
| `GET` | `/api/discussions/history/{decisionId}` | 200 | `History` |
| `POST` | `/api/discussions/analyze` | 200 | `Analyze` |
| `GET` | `/api/channels/{channelId}/checkpoint` | 200 | `GetByChannelId` |
| `POST` | `/api/channels/{channelId}/checkpoint` | 200 | `Save` |
| `GET` | `/api/v1/internal/monitoring` | 200 | `GetMonitoredChannels` |
| `POST` | `/api/v1/internal/analysis-queue/receipts` | 202 | `Receive` |
| `GET` | `/api/v1/internal/analysis-queue/results` | 200 | `Results` |
| `POST` | `/api/v1/internal/analysis-queue/ack` | 200 | `Acknowledge` |
| `GET` | `/api/v1/internal/analysis-queue/capacity` | 200 | `Capacity` |
| `POST` | `/api/v1/internal/analysis-queue/scans` | 200 | `StartScan` |
| `POST` | `/api/v1/internal/analysis-queue/scans/{id}/seal` | 200 | `Seal` |
| `GET` | `/api/v1/internal/analysis-queue/scans/{id}` | 200 | `Scan` |
| `POST` | `/api/v1/internal/analysis-deliveries/sync` | 200 | `Synchronize` |
| `POST` | `/api/v1/internal/analysis-deliveries/retries/{id}/ack` | 200 | `Acknowledge` |

## 전달·분석 완료를 구분하기

- `analysis-queue/receipts`의 202는 Discussion Context와 처리 의도가 영속 수신됐다는 뜻입니다.
  AI 분석이나 후보 발행의 성공을 뜻하지 않습니다.
- Bot은 `results?ids=...`로 결과를 조회하고 `ack`로 수신을 확인합니다.
  채널 스캔은 `scans` 생성 → 범위 전달 → `scans/{id}/seal` → 상태 조회 흐름을 사용합니다.
- `sync-jobs/claim`과 Job 갱신은 Bot 워커용입니다. FE는 사용자
  `POST /api/v1/sync-jobs`, Job 조회와 실패 채널 재개 API를 사용합니다.
- 기존 `/api/discussions/analyze`는 동기 분석 계약을 유지합니다. 자동 재시도와 새로운
  수동 재분석의 요청 ID·의미를 구분합니다. [분석 상태 설명](agentic-analysis.md)을 참고하세요.
- `/api/v1/...` 내부 API도 v1 envelope를 사용합니다. `/api/discussions/...`,
  `/api/channels/...` 등 비-v1 계약에는 같은 envelope를 가정하지 않습니다.

<a id="legacy"></a>

## 정책·기존 피드백

수집 정책 조회는 공개이며, 기존 피드백 조회·등록은 위 서비스 인증이 필요합니다. 서버 인증형 FE API가 아닙니다.

| Method | 경로 | 입력 | 성공 응답 |
| --- | --- | --- | --- |
| GET | `/api/config/policy` | 없음 | 200, HarvestingPolicyDto 직접 반환 |
| GET | `/api/feedbacks` | `channelId?`, `limit?` query | 200, `{feedbacks: ExternalFeedbackItemDto[]}` |
| POST | `/api/feedbacks` | `id/source/content/channelId/createdAt` 필수, `detail` 선택 | 201, `{id, status}` |

서버별 External Feedback 등록·조회·통합 검색은 후속 범위입니다. 기존 서비스 인증 피드백 경로를
실제 FE의 서버별 Feedback Board에 연결하기 전에 guild 소유권·인증 계약을 별도로 정의해야 합니다.

## 갱신

내부 Controller 변경 시 Swagger를 생성하고 이 표의 Method·경로·성공 상태·operationId 및
해시를 함께 갱신합니다. 스캔/전달의 운영 절차는 [Discord 스캔 운영 문서](../operations/discord-scan.md),
저장소/복구 절차는 [BE 저장소 운영](../be-storage-operations.md)을 따릅니다.

## 서버 권한 변경 전달

`POST /api/v1/internal/guild-access/events`는 서비스 인증으로 순서 있는 Gateway 변경과 연결 상태를 전달합니다. reset·중복·순서 공백·재접속 처리는 [권한 운영 문서](../operations/guild-access.md)를 따릅니다. 브라우저는 이 내부 API를 호출하지 않습니다.
