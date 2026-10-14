# AI Integration Review

Historical review of pre-Agentic implementation at b327749. The Agentic refactoring replaces this analysis path; findings and reproduce.mjs document the old baseline, not current regression verification.

## Scope and evidence

실제 AI 연결 경로와 현재 테스트가 검증하지 못한 경계를 검토했다. 애플리케이션 코드 수정 및 유료 공급자 호출은 하지 않았다. `node .scratch/ai-integration-review/reproduce.mjs`는 실제 AiAdapter와 DiscussionService, 격리 SQLite/Prisma 및 주입한 공급자 응답으로 아래 결함을 재현한다. global fetch도 fixture로 대체하여 실제 네트워크를 차단한다. 현재 빌드 산출물을 사용하므로 소스 변경 후에는 BE build가 필요하다.

확인한 .env 파일들은 Gemini provider와 Gemini key를 설정하고 있으며 AI_MODEL은 명시하지 않는다. 키 내용은 출력하거나 저장하지 않았다. 파일의 키 존재는 유효한 키·실계정 모델 권한을 의미하지 않고 실제 프로세스 환경변수는 파일 설정을 덮어쓸 수 있다.

## Findings

### 1. P1 — 빈 Decision이 저장되는 검증 공백

`apps/be/src/extractor/schemas.ts:5–22`의 topic/decision/rationale은 길이 제한 없는 string이다. `DiscussionService`의 새 Decision도 persistence 전 DecisionSchema 검증을 거치지 않는다. production Gemini AiAdapter에 `found:true`와 빈 topic/decision/rationale을 주입하면 실제 임시 DB에 Draft 1개가 저장된다.

앞선 Repository에서 Zod를 제거하는 리팩터링은 영속화 경계의 기존 검증을 Service로 이전하지 못했다. 이것은 그 리팩터링에서 생긴 회귀다. 출력 필수 텍스트의 비어 있음/공백을 검증하고 저장할 도메인 Decision을 Service에서 검증해야 한다. 한 세션의 잘못된 결과가 전체 요청의 성공으로 완료되지 않는 회귀 테스트가 필요하다.

### 2. P2 — 모순되거나 누락된 결과가 정상 no-decision으로 처리됨

`ExtractionResultSchema`의 decisions 기본값은 []이고 found와 목록의 관계를 검증하지 않는다. `{found:true, summary:'A decision exists'}`가 `decisions:[]`로 통과하며, `{found:false, decisions:[validCandidate]}`도 통과한다. DiscussionService는 둘 다 정상 no-decision으로 처리하고 요청을 완료할 수 있다.

후보 누락·flag/list 불일치는 잘못된 구조화 응답으로 거절하고, 명시적인 `{found:false, decisions:[]}`만 정상 no-decision으로 인정해야 한다.

### 3. P2 — OpenAI의 잘못된 출력이 일시 장애로 오분류됨

설치된 AI SDK 3.4.33은 잘못된 JSON에 AI_JSONParseError, 잘못된 schema에 AI_TypeValidationError를 던진다. AiAdapter는 ZodError/SyntaxError만 판별하여 이를 503으로 변환한다. production OpenAI 경로에 실제 SDK가 파싱하는 fixture Chat Completions 응답을 주입해 두 경우 모두 retryable 503임을 확인했다.

현재 요구사항의 invalid structured output은 intervention을 요구하는 retained failure로 분류되므로 SDK error 타입까지 구분해야 한다. Gemini의 동일 오류와 일관된 분류/재시도 테스트가 필요하다.

### 4. P2 — OpenAI 경로의 주입 전송 함수가 무시됨

AiAdapter의 세 번째 transport 인자는 Gemini에서만 사용된다. OpenAI는 createOpenAI/generateObject를 통해 global fetch를 사용한다. fixture 요청에서 global fetch 1회, 주입 transport 0회를 확인했다. 기존 테스트의 외부 네트워크 차단으로 유료 호출은 방지되지만, Gemini처럼 독립적인 provider HTTP 테스트를 만들 수 없다.

설치된 @ai-sdk/openai 0.0.15에는 provider fetch 주입 설정도 없으므로 현재 SDK와 맞는 모델/HTTP seam을 마련해야 한다. OpenAI 성공, 401/404, 429/503, 잘못된 JSON, 잘못된 schema, deadline과 request model/header/body를 실제 SDK 경로에서 검증해야 한다.

## Additional readiness gaps

- Gemini request는 responseMimeType만 지정하고 출력 JSON Schema를 제공하지 않는다. API가 JSON을 생성하도록 요청하는 것과 앱 계약을 강제하는 것은 다르다. 공급자에 지원되는 schema 형식을 전달하고 앱에서도 의미 검증을 수행해야 한다. [Gemini 구조화 출력](https://ai.google.dev/gemini-api/docs/structured-output), [GenerateContent API](https://ai.google.dev/api/generate-content).
- 기본 gemini-2.5-flash의 접근 가능성을 키 존재로 판단할 수 없다. 현재 공식 문서는 2.5 모델의 접근을 기존 사용 계정으로 제한한다고 안내한다. AI_MODEL을 계정에서 접근 가능한 모델로 명시하고 실제 소량 연결 테스트가 필요하다. [Gemini 모델 안내](https://ai.google.dev/gemini-api/docs/deprecations).
- 원문 인용은 string[] 형식만 확인하고 원문에 실제 있는 인용인지 대조하지 않는다. prompt의 금지 문구만으로 환각을 검증할 수 없다.
- 정확도 평가는 fixture 응답 테스트로 대신할 수 없다. 한국어·영어 합의, 합의 없는 제안, 부정·철회, 보류, 잡담·일정, 다중 결정, 근거 없음 사례에 gold annotations를 붙여 precision/recall·허위 인용률·누락률을 평가해야 한다.
- 실제 공급자 latency, 토큰 사용, 비용, 현재 키·모델 접근 및 실대화 추출 품질은 이번 검토에서 측정하지 않았다.

## Sources

OpenAI API의 schema adherence와 JSON 형식 보장의 구분은 [공식 Structured Outputs 문서](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat)를 참고했다. 이 프로젝트의 실제 OpenAI 요청/오류 동작은 설치된 ai 3.4.33 및 @ai-sdk/openai 0.0.15 소스와 fixture SDK 실행으로 확인했다. 최신 API 기능을 설치 SDK가 지원한다고 가정하지 않았다.

## Next validation order

1. 빈 필수 텍스트와 모순된 extraction result를 거절하는 Service/adapter 회귀 검증.
2. 공급자 HTTP 응답을 실제 AiAdapter → DiscussionService → DB 경계까지 연결한 검증, SDK 오류 분류 일치 및 OpenAI seam 보강.
3. Gemini 출력 schema와 원문 인용 검증.
4. 별도 명시적 실행으로 계정 키/모델 연결 확인 및 소량 gold 데이터 평가. 실제 Discord 대화·운영 DB 대신 합성 대화와 임시 DB를 사용한다.

확정 코드 결함 4건과 추가 연결/품질 검증 공백을 기록했다. 애플리케이션 코드는 변경하지 않았다.
