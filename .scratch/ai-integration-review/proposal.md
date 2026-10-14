# AI Integration Follow-up — Ticket Proposal

Status: needs-triage

설계 갱신: 아래 내용은 Agentic 설계 이전의 역사적 제안이다. [평가·인계 결정](../be-agentic-decision-design/issues/06-evaluation-and-handoff.md)의 유지·수정·대체표를 기준으로 새 spec과 구현 티켓에 재분배한다. 이 목록의 기존 dependency나 인용 필수 조건을 그대로 실행하지 않는다. 아직 issues/에 게시하지 않았다.

티켓 분할 승인 대기 초안이다. 원본 검토 보고서는 review.md에 보존하며 기존 부모 이슈는 변경하지 않는다. 승인 후 각 draft를 issues/의 개별 티켓으로 게시하고 ready-for-agent를 적용한다.

## Scope

확정 결함 4건과 Gemini 구조화 출력·원문 인용·실제 연결/품질 검증 공백을 다룬다. FE 변경, 운영 DB 변경, 배포는 포함하지 않는다. 일반 자동 테스트는 외부 AI를 호출하지 않는다. live 연결 도구와 평가 도구 구현 및 실제 유료 실행은 별도 단계로 구분한다.

## Dependencies

01, 02, 04는 즉시 착수 가능하다. 01의 인스턴스별 공급자 주입 경계는 03의 SDK 오류 전달 검증을 가능하게 한다. 02의 Service 출력 검증 경계 위에서 05가 인용 진위를 검사한다. 03과 04가 완료되면 06에서 실제 공급자 연결을 검증하고, 05와 06이 완료되면 07에서 원문 인용까지 포함한 실제 품질을 평가한다. 같은 파일을 공유하는 독립 티켓은 순차 통합하되 구현 편의만으로 blocking edge를 추가하지 않는다.

## Drafts

- [01: OpenAI 공급자 경로를 독립적으로 검증 가능하게 만들기](ticket-drafts/01-openai-provider-seam.md)
- [02: 빈 결정과 모순된 분석 결과의 정상 완료 차단](ticket-drafts/02-reject-invalid-extraction.md)
- [03: 공급자 오류에 맞는 재시도와 retained failure 처리](ticket-drafts/03-provider-error-delivery.md)
- [04: Gemini에 분석 응답 계약을 전달하기](ticket-drafts/04-gemini-structured-response.md)
- [05: Rationale 원문 인용의 진위 검증](ticket-drafts/05-transcript-quote-integrity.md)
- [06: 실제 AI 연결을 별도 실행으로 확인하기](ticket-drafts/06-live-ai-smoke.md)
- [07: 실제 대화 유형별 Decision 추출 품질 평가](ticket-drafts/07-ai-extraction-evaluation.md)
