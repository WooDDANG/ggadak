# FE 테스트용 목 데이터

[fixtures.json](./fixtures.json)을 FE 팀에 전달하면 됩니다. Discord 로그인·BE·AI 공급자 없이 화면 개발에 사용할 수 있는 합성 데이터입니다. 기준일은 2026-10-22입니다.

각 항목은 `request`(method, path, query, 필요한 경우 body)와 `response`(HTTP status, JSON body)로 구성됩니다. 실제 API 응답으로 반환할 값은 **`response.body`**입니다. 그 안의 `data`만 반환하면 현재 FE 클라이언트의 envelope 처리와 맞지 않습니다.

| Fixture 키 | 테스트할 화면·상태 |
| --- | --- |
| `auth.me`, `auth.guilds`, `auth.session` | 사용자·서버 선택·세션 복원 |
| `channels` | 모니터링 채널 선택, 접근 불가 채널 |
| `dashboard`, `dashboard.empty` | 집계·최근 결정·동기화 완료, 최초 사용 |
| `review.inReview`, `review.onHold`, `review.empty` | Review Queue 대기·보류·빈 목록 |
| `decisions`, `decisions.empty` | 전체 목록과 빈 목록 |
| `detail.CONFIRMED`, `detail.IN_REVIEW`, `detail.ON_HOLD`, `detail.SUPERSEDED`, `detail.DISCARDED` | Decision Card의 다섯 상태 |
| `timeline`, `timeline.empty` | 월별 Decision Timeline과 빈 결과 |
| `search`, `search.empty` | Why 검색 결과와 결과 없음 |
| `review.confirm` | 독립 확정 요청·응답, version 1 → 2 |
| `error.unauthorized`, `error.forbidden`, `error.conflict`, `error.unavailable` | HTTP 401·403·409·503 |

모든 기본 화면은 동일한 guildId와 Decision ID를 공유합니다. 확정 1건·대기 1건·보류 1건·대체된 기록 1건·거절 1건이 들어 있습니다. 결정 목록의 `items`는 v1 카드이고 `decisions`는 호환용 도메인 모델입니다. 대안 필드도 각각 `name`과 `option`으로 다르므로 그대로 유지합니다.

## 가져다 쓰기

FE 프로젝트로 JSON을 복사한 뒤 필요한 응답을 선택합니다. 아래 함수는 테스트 응답을 만드는 예시이며 실제 fetch를 자동으로 가로채지는 않습니다. 기존 fetch mock이나 mock handler에서 반환하면 됩니다.

```ts
import bundle from './fixtures.json';

function mockResponse(name: keyof typeof bundle.fixtures): Response {
  const { status, body } = bundle.fixtures[name].response;
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

// GET /api/v1/dashboard를 처리하는 mock handler에서 반환
const response = mockResponse('dashboard');
```

기본 데이터의 guildId는 `119283746592019280`입니다. 각 fixture의 `request.query`를 참고해 query와 body를 매칭하세요. 예를 들어 `/api/v1/review-queue`는 `status=IN_REVIEW`와 `status=ON_HOLD`에 다른 응답을 반환합니다. 빈 목록·오류 시나리오는 같은 요청에 대한 대체 응답이므로 테스트마다 하나를 선택합니다.

## 데이터 해석과 범위

- 각 fixture는 독립된 스냅샷입니다. `review.confirm` 호출 후 목록·Dashboard가 자동으로 바뀌지는 않습니다. 확정 이후 화면을 이어서 테스트하려면 mock handler의 메모리 상태도 갱신해야 합니다.
- `auth.session`의 토큰은 목 값입니다. 실제 BE 인증에는 사용할 수 없습니다. OAuth 이동·쿠키·토큰 만료 검증은 실제 연동에서 확인합니다.
- 보류 후보는 근거가 명시되지 않은 사례입니다. `rationaleStatus=not_stated`, 빈 `rationale`, 빈 대안·Action Item, 담당자·기한 생략을 처리하세요.
- `supersedesId`, `supersededById`, `approvedBy`, `decisionConfirmedDate`, `feedbackSourceType`, `feedbackSourceDetail`, `feedbackReceivedDate`는 실제 BE 동작에 따라 null일 수 있습니다. [기존 계약 문서의 주의사항](../frontend-api.md#caveats)과 같습니다.
- Discord URL과 ID는 합성 값입니다. 실제 Discord 원문으로 연결되지 않습니다. 날짜는 고정이므로 최근 기간 필터를 테스트할 때 2026년 10월을 선택하세요.
- 이 묶음은 화면 표시와 독립 확정 응답을 위한 것입니다. 편집·Supersede/Pivot 처리·동기화 진행·분석 그래프·재시도 흐름은 포함하지 않습니다.

## 검증 기준

21개 성공 응답을 현재 [OpenAPI](../../../apps/be/src/api/docs/swagger.json)의 응답 스키마와 대조했습니다. 위에 명시한 nullable 필드는 기존 계약 문서와 BE 런타임에 맞춰 검증 시 허용했습니다. 원본 Swagger는 수정하지 않았습니다. 오류 4개는 공통 실패 envelope를 확인했고, 기본 Decision 5건은 공유 `DecisionSchema`로 검증했습니다. 페이지 수와 ticketId=id도 확인했습니다.

API 필드가 바뀌면 이 묶음도 함께 갱신하세요. 전체 계약은 [FE API 연동 문서](../frontend-api.md)를 참고합니다.
