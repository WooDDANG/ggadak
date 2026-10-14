# 열린 티켓 대조 — 2026-10-14

현재 코드와 후속 완료 기록을 대조한 결과다. 티켓 상태는 변경하지 않았다. 전체 테스트는 재실행하지 않았으며 아래 테스트 언급은 테스트 코드 및 기존 검증 기록을 뜻한다.

## 구현이 확인된 오래된 티켓

- `discord-decision-tracker` 01–03: Prisma schema/repository/loader, TypeDI, TSOA controllers/routes, Swagger가 구현돼 있다. `db:push` 대신 `db:migrate`를 쓰고 생성 경로도 변경됐으므로 이전 체크리스트를 그대로 구현하지 않는다. ADR-0017과 additive migration 정책을 따른다.
- 같은 작업의 04: Bot API와 FE Review Queue는 후속 v1/reliability 작업으로 연결됐고 HTTP·FE 테스트가 있다. 이전 API 경로·Discord 검수 요구는 현재 계약과 ADR-0019에 맞춰 종결해야 한다.
- 같은 작업의 09–11: harvesting engine/harvester, 세션 분할·점수, Evidence Hash 차단·manual override 구현과 테스트가 있다. 09–13의 기존 체크박스도 전부 완료 표시다.
- `bot-logging` Winston 라벨·앱별 로그 격리: `packages/shared/src/logger.ts`와 `logger.test.ts`에서 구현 및 Bot/BE 파일 검증을 확인했다.
- `discord-transcript-viewer/spec.md`: viewer 컴포넌트와 Review Queue/Decision Timeline 연결이 있다.
- `ai-integration-review/ticket-drafts`: proposal 자체가 역사적 제안으로 표시돼 있고 agentic 분석 티켓에 재분배됐다. 새 미구현 목록으로 사용하지 않는다.

## 실제 남은 항목 또는 다시 명세할 항목

1. **FE Timeline 점수 표시 — discord-decision-tracker 12 일부**: 서버의 원자적 Supersede와 Action Item 이관은 구현/테스트돼 있다. Review Queue에 Governance Score가 있지만 `DecisionTimeline.tsx`에는 없다. 대체 ID는 텍스트로 표시되며 탐색 가능한 대체 체인은 확인되지 않았다. 최신 v1 타임라인 범위와 맞춰 UI 후속 티켓으로 분리할 수 있다.
2. **포맷 검사 — discord-decision-tracker 05 일부**: 이번 `npm run format:check`는 실패했다. 대상은 `apps/be/src/loaders/index.ts`, `apps/be/src/test-support/ai-fixture.ts`, `apps/bot/src/services/backend-api.service.test.ts` 3개다. 기존 전체 테스트 통과 기록과 별개로 해결할 구체적인 작업이다. 100% coverage는 실행 성공과 다른 요구이며 달성 증거가 없다.
3. **실제 대화 임계값 보정 — dense-embedding-decision-detector 02**: anchor corpus, configurable threshold, 소수 예문 테스트는 구현돼 있다. 실제 대화 표본의 오탐/미탐 측정과 임계값 선택 근거는 확인되지 않았다. 현재 scorer는 단어·문자 n-gram·어간의 Map 특징과 재조정한 cosine 점수를 사용한다. 신경망 dense embedding 또는 원시 cosine 0.70으로 간주하면 안 된다.
4. **지연 측정·캐시 판단 — 같은 작업 03**: 채널별 debounce/직렬화는 구현돼 있다. scorer는 message handler에서 동기 계산하며 LRU 또는 지연 벤치마크는 확인되지 않았다. 먼저 메시지 길이·부하별 성능을 측정하고 캐시/비동기화 필요성을 결정해야 한다. 02의 결과에 의존하는 설계 작업이다.
5. **통합 시나리오 재확인 — discord-decision-tracker 13**: 관련 동작은 BE/Bot/HTTP 테스트에 분산돼 있다. 기존 티켓이 요구하는 모든 흐름을 하나로 연결한 E2E 보장은 별도 대조가 필요하다. 테스트 부족이 확정된 구현 결함이라는 뜻은 아니다.

## 티켓 구현과 별개로 남은 실행

agentic 분석의 실제 Gemini/OpenAI smoke, 유료 모델 비교 평가, 한국어 gold 50개와 품질 목표 검증, 운영 DB migration 적용은 아직 수행하지 않았다는 최신 검증 기록이 있다. 도구 구현 티켓 06/07을 다시 여는 대신 대상 환경·예산·검수 담당을 명시하는 실행 작업으로 관리한다.

## 권장 순서

포맷 3개 수정 → 최신 계약에 맞춘 Timeline UI 후속 티켓 → 실제 대화 임계값 평가와 지연 측정 → 결과에 따라 scorer/캐시 변경. 기존 티켓의 완료 상태 정리는 이 대조 결과와 최신 명세를 반영해 별도로 수행한다.
