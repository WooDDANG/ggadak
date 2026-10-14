# Agentic 분석 구현 검증 — 2026-10-14

기존 production 단일 호출 분석을 추출 → 구조 검사 → 의미 검증 → 한 번 수정/재검증의 durable workflow로 교체했다. 사용자 최종 확정 정책, 입력 대화 한정 분석, 미합의 후보·논리 그래프와 근거 미언급을 반영했다. Bot 시작/서버 초대 자동 전수 스캔은 제거하고 명시적 스캔과 새 메시지 추적은 유지한다. FE 소스는 변경하지 않았다.

## Verification

- `npm test`: 전체 Shared/BE/Bot/FE 빌드와 workspace 테스트 및 E2E 통과. BE 88개, E2E 6개 포함.
- `npm run typecheck`: 통과.
- `npm run lint`: 오류 0개. 기존 shared logger 테스트의 미사용 beforeEach 경고 1개 유지.
- `python3 -m unittest discover -s scripts/evaluation -p 'test_*.py'`: 8개 통과.
- 실제 HTTP API·임시 SQLite·고정 AI 응답으로 미합의 후보, 근거 없음, 구조/의미 수정, terminal 재전송 무호출, transient 재개, 다중 세션 원자 공개, guild 접근 차단, snapshot/history를 검증했다.
- 최종 critic 오류가 최초 오류로 남는 문제를 새 HTTP 회귀 테스트로 먼저 재현한 뒤 수정했다. 최종 검증 응답과 참조 ID, feedback, owner/deadline/오류가 checkpoint에 보존된다.
- 공식 AMI 자료 변환과 dev/test 각 20개 gold 준비, 실제 AMI 한 회의의 offline fixture runner 실행을 확인했다. 외부 AI 호출 수는 0이다.
- Swagger와 FE 공유 Markdown에 분석 상태/그래프 API와 nullable 근거·재분석 정책을 반영했다.

## Review

고정 기준 `b3277490c3d8928c939ebbae0875d2a508a9b0f5`에서 Standards/Spec을 병렬 검토했다. Standards의 기존 SDK ADR 충돌은 [ADR-0022](../../docs/adr/0022-explicit-provider-http-for-bounded-analysis.md)와 기존 ADR supersession으로 해결했다. Spec의 최종 검증 진단 누락도 수정 후 재검토에서 해결 확인을 받았다. 남은 확정 지적은 0개다.

## Deployment and quality boundaries

새 additive migration `202610140001_agentic_analysis`는 임시 DB에서 검증했고 원본 운영 DB에는 적용하지 않았다. 운영 분석 실행 전 해당 migration 적용이 필요하다: 저장소 루트에서 `npm run db:migrate --workspace=@ggaddak/be` (대상 DATABASE_URL 확인).

실제 Gemini/OpenAI 연결 smoke, 유료 AMI 비교 평가, 한국어 서비스 gold 50개 확보 및 90% 품질 달성은 실행하지 않았다. [평가 도구 사용법](../../docs/research/agentic-evaluation-usage.md)에 별도 예산을 명시하는 명령과 gold 검수 절차를 기록했다. 오프라인 fixture 통과는 실제 모델 정확도를 증명하지 않는다.

외부 AI 응답과 DB checkpoint 사이 crash에 대한 exactly-once 호출 보장은 없다. 재개 시 호출 예산과 실행 시간을 보존하고 owner fencing 및 transaction으로 중복 공개를 막는다.
