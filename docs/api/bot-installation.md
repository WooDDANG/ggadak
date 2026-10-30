# 봇 설치 상태와 실제 FE 설치 안내

이 계약은 별도로 개발하는 실제 FE가 선택한 Discord 서버의 봇 설치를 안내하기 위한 것입니다. 이 저장소의 FE는 데모이며, 실제 화면 연결은 FE 개발자가 수행합니다. 공통 인증·응답 규칙은 [FE API 연동 문서](frontend-api.md)를 따릅니다.

## 상태 조회

`GET /api/v1/discord/bot-status?guildId=<string>`

- 필수 query: `guildId` — 선택 서버 ID. 문자열을 그대로 사용합니다.
- 인증: `Authorization: Bearer <accessToken>` 및 해당 서버 membership.
- 성공: HTTP 200, v1 `success/code/message/data` envelope.
- 응답: `Cache-Control: no-store`. `checkedAt`은 이번 확인 시각이며 이후에도 상태가 같다는 보장은 아닙니다.

| data 필드 | 타입 | 의미 |
| --- | --- | --- |
| `guildId` | `string` | 확인 대상 서버 |
| `status` | `"installed" \| "not_installed" \| "unknown"` | 설치됨 / 확인된 미설치 / 확인 불가 |
| `canManage` | `boolean` | BE가 판정한 서버 owner 또는 Manage Server 권한 여부 |
| `installUrl` | `string \| null` | 설치 설정이 유효하고, 미설치가 확인된 서버의 관리자에게 제공하는 설치 링크 |
| `checkedAt` | `string` | 확인 시각, ISO 8601 |

`installed`는 봇이 해당 서버에 설치되어 있다는 뜻입니다. 봇 프로세스의 온라인 상태나 모든 채널의 읽기 권한까지 의미하지 않습니다. 채널별 접근 가능 여부는 기존 `GET /api/v1/discord/channels`의 `accessible`로 확인합니다.

`unknown`은 설정·인증 정보·Discord 연결·응답 등으로 설치 여부를 확정할 수 없다는 뜻입니다. 일반적인 채널 조회 403/404나 네트워크 장애를 곧바로 미설치로 표시하지 않습니다. 이 상태에서는 재설치를 유도하지 않고 재확인 안내를 제공합니다.

## 응답 예제

값은 합성 데이터입니다. 각 JSON은 성공 envelope의 `data` 부분입니다. 모든 상태는 `canManage`와 별개이며, 설치 링크는 아래 조건을 모두 충족할 때만 제공합니다.

### 설치됨 — 관리자

```json
{
  "guildId": "11928374659201928",
  "status": "installed",
  "canManage": true,
  "installUrl": null,
  "checkedAt": "2026-10-30T03:00:00.000Z"
}
```

관리자는 채널 설정으로 진행합니다. 일반 멤버도 `installed`를 받지만 `canManage: false`, `installUrl: null`이며, 채널 설정 저장은 기존 BE 권한 검사를 따릅니다.

### 미설치 — 관리자

```json
{
  "guildId": "11928374659201928",
  "status": "not_installed",
  "canManage": true,
  "installUrl": "https://discord.com/oauth2/authorize?client_id=123456789012345678&scope=bot%20applications.commands&guild_id=11928374659201928&disable_guild_select=true&permissions=66624&integration_type=0",
  "checkedAt": "2026-10-30T03:00:00.000Z"
}
```

FE는 BE가 반환한 URL을 사용합니다. 위 예제는 링크 구조를 보여주는 합성 값이며, 실제 권한 값과 애플리케이션 ID는 BE가 생성한 값을 따릅니다. 로그인용 `identify guilds` OAuth URL을 봇 설치 URL로 재사용하지 않습니다. 미설치 관리자라도 설치 설정이 유효하지 않으면 `installUrl`은 null이며 설치 버튼을 활성화하지 않습니다.

### 미설치 — 일반 멤버

```json
{
  "guildId": "11928374659201928",
  "status": "not_installed",
  "canManage": false,
  "installUrl": null,
  "checkedAt": "2026-10-30T03:00:00.000Z"
}
```

“서버 관리자에게 봇 설치를 요청하세요”를 표시합니다. FE의 버튼 노출과 별개로 BE가 관리 권한을 판정합니다.

### 확인 불가 — 관리자 또는 일반 멤버

```json
{
  "guildId": "11928374659201928",
  "status": "unknown",
  "canManage": true,
  "installUrl": null,
  "checkedAt": "2026-10-30T03:00:00.000Z"
}
```

일반 멤버의 예제에서는 `canManage`만 false입니다. 두 역할 모두 상태를 재확인할 수 있으며, 설치 여부가 확인될 때까지 미설치로 단정하지 않습니다.

## 오류와 접근 범위

| HTTP 상태 | FE 처리 |
| --- | --- |
| 400 | 필수 query 등 요청 형식 확인 |
| 401 | accessToken 복원 또는 재로그인 |
| 403 | 선택 서버 접근 권한 확인. 세션 권한 갱신이 필요한 경우 세션 복원 후 재확인 |
| 200 + `unknown` | 설치 상태를 확인하지 못함. 재확인 안내 |
| 그 밖의 실패 | 일반 API 오류로 표시하고 명시적 재시도 제공 |

인증·서버 접근 실패는 성공 `unknown`으로 변환하지 않습니다. `BOT_SERVICE_TOKEN`이나 Discord bot token은 FE에 전달하지 않습니다.

설치 안내를 애플리케이션 전체 접근 차단으로 사용하지 않습니다. 봇이 미설치이거나 확인 불가여도, 저장된 Decision Record의 조회·검수·편집·Why 검색은 기존 로그인·서버 접근 권한에 따라 계속 이용합니다. 새 수집·채널 설정에서는 설치 상태와 기존 채널 권한을 각각 확인합니다.

## 실제 FE 연결 순서

1. 로그인하거나 `POST /api/v1/auth/session`으로 브라우저 세션을 복원하고 서버를 선택합니다. 로그인 과정에서 모든 서버의 봇 설치를 일괄 조회할 필요는 없습니다.
2. 선택한 `guildId`의 상태를 조회합니다. 캐시 키에는 `guildId`를 포함하고, 서버 전환 시 이전 응답이 새 서버 화면에 표시되지 않게 합니다.
3. `installed`이면 채널 설정 흐름으로 진행합니다. `not_installed`이면 관리자는 설치 버튼, 일반 멤버는 관리자 요청 안내를 표시합니다. `unknown`이면 확인 실패와 재확인 버튼을 표시합니다.
4. 설치 버튼은 사용자 클릭으로 `installUrl`을 새 탭에 엽니다. 원래 FE의 로그인·선택 서버를 유지합니다. 새 탭을 열 때 opener 관계를 끊습니다.
5. 원래 FE로 포커스가 돌아오면 선택한 서버의 상태를 새로 조회하고, 수동 “다시 확인” 버튼도 제공합니다. 중복 확인은 합치고 오래된 요청 결과로 현재 서버 상태를 덮어쓰지 않습니다.
6. 서버의 새 조회 결과가 `installed`일 때만 채널 설정으로 이어갑니다. 설치 창을 닫았거나 다른 서버에 설치했다는 사실만으로 성공을 표시하지 않습니다.
7. 설치 취소·실패 후에는 원래 서버의 실제 상태에 맞는 안내를 유지합니다. 기존 결정 조회·검수·검색 경로는 유지합니다.

이 흐름은 FE 전달 계약입니다. BE 상태 API나 생성 클라이언트가 존재한다는 것만으로 별도 FE 화면이 연결된 것은 아닙니다.

## 전달·검증 체크리스트

- [ ] FE가 사용한 Swagger와 이 연동 문서의 버전·SHA-256을 함께 기록한다.
- [ ] 생성 클라이언트의 enum, nullable `installUrl`, 문자열 ID, ISO 날짜와 envelope가 문서와 일치한다.
- [ ] 관리자·일반 멤버에서 설치됨·미설치·확인 불가 화면과 링크 조건을 확인한다.
- [ ] 서버 변경, 늦은 응답, 중복 클릭, 설치 취소, 다른 서버 설치 후에도 선택 서버가 정확히 유지된다.
- [ ] 포커스 복귀와 수동 재확인이 새 상태를 읽으며, 새 창을 닫은 사실만으로 설치 성공을 표시하지 않는다.
- [ ] 세션 만료·서버 접근 거부를 `unknown`으로 숨기지 않고 처리한다.
- [ ] 봇 상태와 무관하게 권한 있는 기존 결정 조회·검수·검색이 가능하다.
- [ ] 자동 테스트의 Discord transport fixture 검증과 실제 Discord 설치 확인 결과를 구분한다.
- [ ] 실제 FE 개발자가 실제 계정의 설치·취소·복귀·채널 설정을 확인하고 결과를 기록한다.

## 이번 범위 밖

서버별 External Feedback 등록·조회는 후속 기능입니다. 기존 `/api/feedbacks`는 guild 인증형 계약이 아니므로 실제 FE의 서버별 피드백 기능에 그대로 연결하지 않습니다. 봇 설치 상태를 위해 기존 사용자 API를 새로 만들거나 데모 FE 화면을 수정할 필요는 없습니다.
