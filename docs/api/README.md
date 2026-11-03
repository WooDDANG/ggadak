# API 문서 안내

실제 FE 개발자는 이 페이지에서 시작합니다. 이 저장소의 `apps/fe`는 데모이며,
BE API 제공과 별도 FE의 화면 연결·실제 Discord 검증은 각각 확인해야 합니다.

## 읽는 순서

| 순서 | 문서 | 확인할 내용 |
| --- | --- | --- |
| 1 | [FE API 연동 계약](frontend-api.md) | 연결 설정, 인증, 응답·오류, 화면별 요청·필드 |
| 2 | [봇 설치 상태와 설치 안내](bot-installation.md) | 서버 선택, 역할별 설치 안내, 설치 후 재확인 |
| 3 | [분석 상태·논리 그래프](agentic-analysis.md) | 분석 진행·실패, 그래프 snapshot, 재분석 의미 |
| 참고 | [설계 초안 비교](design-draft-comparison.md) | 이전 초안의 경로·필드에서 현재 계약으로 옮기는 방법 |
| Bot/BE | [Bot·내부·기존 API](internal-api.md) | 서비스 인증, 비동기 수신·결과 확인, 기존 비-v1 계약 |

## 계약의 기준

- 경로·Method·입출력 스키마: [현재 swagger.json](../../apps/be/src/api/docs/swagger.json).
- Swagger UI: BE 실행 후 <http://localhost:3001/api-docs/>.
- Swagger가 표현하지 못한 쿠키·권한·조건부 검증: FE 계약의 **구현 보완** 및 각 상세 문서.
- 계약의 생성 원본: BE Controller·DTO. 문서 편집으로 API가 변경되지는 않습니다.
- 현재 스펙의 SHA-256은 [FE 계약 상단](frontend-api.md)에 기록합니다. 실제 FE가
  사용한 스펙 파일과 해시를 함께 보관하세요.

## 화면에서 사용하는 흐름

| 흐름 | 연결할 계약 |
| --- | --- |
| 새 로그인 | `auth/authorize` → Discord → `auth/login` → `auth/session` |
| 재접속 | 쿠키로 `POST /api/v1/auth/session`, 사용자와 접근 가능한 서버 복원 |
| JWT 만료 복구 | 쿠키로 `POST /api/v1/auth/token`, Discord 조회 없이 JWT 재발급 |
| 서버 설정 | 서버 선택 → `discord/bot-status` → 필요 시 설치·재확인 → `discord/channels` |
| 동기화 | `POST /api/v1/sync-jobs`의 202 접수 → job 조회 → 실패 채널의 전달 재개 |
| 검수·편집 | Review Queue·카드 조회 → `expectedVersion` 포함 요청 → 관련 화면 갱신 |
| 조회 | Decision 목록·상세·이력, Why 검색, Timeline |
| 분석 복구 | analysis-deliveries·analysis-requests 조회 → 재시도 또는 새 수동 분석 |

전체 URI·필수 query·응답 모델은 [FE 계약](frontend-api.md#overview)을 따릅니다.
설치 상태가 미설치·확인 불가여도 기존 결정 조회·검수·검색은 서버 접근 권한에 따라
계속 이용합니다. 봇 설치 여부와 채널 접근 가능 여부, 봇 프로세스 온라인 여부는 다릅니다.

## 이번 반영과 후속 범위

- 반영됨: `GET /api/v1/discord/bot-status`, 설치 상태 3종, 관리자용 설치 링크,
  생성 클라이언트, 최신 브라우저 세션 안내.
- FE 개발자 연결: 새 탭 설치, 포커스 복귀·수동 재확인, 서버별 캐시 격리.
  [전달·검증 체크리스트](bot-installation.md#handoff)를 함께 확인합니다.
- 후속 기능: 서버별 External Feedback 등록·조회. 기존 `/api/feedbacks`를
  서버 인증형 사용자 API로 취급하지 않습니다.
- 남은 스키마 제약: [스펙 주의사항](frontend-api.md#caveats). 내부 service scheme,
  일부 nullable·strict 입력·오류 선언은 보완 설명을 함께 읽어야 합니다.

## BE 개발자가 계약을 바꿀 때

1. Controller·DTO·검증 로직을 변경하고 영향받는 계약을 확인합니다.
2. Herdr `verify` 탭에서 `npm run api:sync`를 실행합니다. Swagger·라우트와
   이 저장소의 Orval 생성 클라이언트를 갱신하는 명령이며 서버 실행 명령은 아닙니다.
3. 변경된 경로·필드·오류·권한·예제를 해당 상세 문서와 아래 내부 API 표에 반영합니다.
4. Swagger 해시를 갱신하고, 문서 링크·목록·생성 타입을 확인합니다.
5. 자동 테스트 결과와 실제 FE/Discord 연결 확인 결과를 구분해 전달합니다.

더 깊은 인증 동작은 [웹 세션 모델](../model/web-session.md), BE 설정은
[인증 설정](../../apps/be/AUTH.md), 스캔 운영은 [운영 문서](../operations/discord-scan.md)를 참고합니다.
