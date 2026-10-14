# BE Agentic 의사결정 분석 설계

Label: wayfinder:map
Status: resolved

## Destination

입력 대화에서 Decision Candidate를 추출·검증하고 논리 그래프를 구성하는 BE 알고리즘과 데이터 계약을 합의한다. 입력·출력, 단계·분기·종료, 실패·재시도, 인간 검수 경계, 평가 기준이 명세 가능한 수준이면 완료한다.

## Notes

- 2026-10-13 사용자 합의: AI가 팀 대신 결정을 내리는 서비스가 아니라 대화 기반 결정 추출 서비스다. 합의 없이 끝난 제안도 검수 후보로 제출한다.
- 요약·근거·대화 관측·후보 묶음의 상세 합의는 아래 검수 후보 의미 결정 티켓에 기록한다.
- 사용자 합의: 이번에는 입력 대화 안에서만 분석한다. 과거 Decision Record 조회·비교는 범위 밖이다.
- 사용자 합의: 논리 그래프 계약까지 설계한다. 정식 확정·Supersede는 사람의 검수로만 수행한다. FE 소스 작업은 하지 않는다.
- 이 map은 계획 전용이다. 앱 구현, AI 후속 구현 티켓 실행, DB 변경은 하지 않는다. 설계 후 기존 AI 티켓을 유지·수정·대체할지 판단한다.
- 인계 결과: [BE Agentic 의사결정 분석과 논리 그래프 spec](../be-agentic-decision-analysis/spec.md)을 ready-for-agent로 게시했다. 이후 사용자 별도 지시로 Bot 시작/서버 초대 자동 스캔 제거를 먼저 적용했으며, 본 Agentic workflow 구현은 아직 시작하지 않았다.
- 매 세션 grilling과 domain-modeling 스킬 및 BE/Shared CONTEXT를 확인한다. research 티켓은 research 스킬로 1차 출처를 조사한다. 기존 용어를 따르며 새 용어는 인간과 합의한 뒤 기록한다.
- 출발점: [기존 연구 문서](../../docs/research/ai-agentic-decision-visualization.md), [현재 AI 검토](../ai-integration-review/review.md). 연구 문서의 알고리즘·프레임워크·임계치는 채택된 명세가 아니다.
- 현재 코드는 전처리·admission → 세션당 단일 AI 호출 → 규칙 기반 Governance Score → Draft 저장이다. 별도 critic/refinement loop와 typed 논리 그래프는 없다. Governance Score를 근거 검증 점수와 혼동하지 않는다.
- ADR-0018/0019/0020의 BE DB 권위, 인간 검수, 요청 멱등성 및 실패 보존을 기본 제약으로 삼는다. ADR-0014의 미합의 제안 제외 정책의 변경 범위는 검수 후보 의미 결정 티켓에서 합의했다.
- 로컬 tracker에서는 Type/Label, Status, Blocked by를 사용한다. research 외에는 세션당 최대 한 티켓만 해결한다. 이 charting 세션은 인간 결정 티켓을 해결하지 않는다.

## Decisions so far

<!-- 해결된 결정의 요약과 해당 티켓 링크만 추가한다. 상세 답변은 티켓 한 곳에 보존한다. -->

- [입력 대화 분석에 적합한 제한된 Agentic 워크플로우 조사](issues/01-bounded-workflow-research.md): TypeScript 단계·critic·그래프 검증 선택지와 구조화 출력의 한계를 조사했고, 미검증 임계치와 기술 채택을 구분했다.
- [합의되지 않은 제안과 AI 요약의 검수 후보 의미 결정](issues/02-candidate-semantics.md): 미합의 제안도 검수하며 AI 요약·대화 관측·선택별 묶음과 철회 이력을 인간 확정 상태와 구별한다.
- [검수 후보와 연결되는 논리 그래프 계약 결정](issues/03-logical-graph-contract.md): 6종 노드·의미 관계와 BE 발급 ID를 사용하고, 구조 오류는 보정하며 대화 모순·미해결 맥락은 보존한다.
- [추출·검증·수정 워크플로우와 종료 조건 결정](issues/04-analysis-algorithm.md): TypeScript 고정 단계로 항상 의미 검증하고 수정은 한 번·최대 4회 AI 단계 호출로 제한하며 최종 검증 실패는 보존한다.
- [다단계 분석의 저장·재시도·검수 전달 경계 결정](issues/05-durable-execution.md): 단계별 DB 재개와 누적 예산을 유지하고 요청 전체를 원자 공개하며, AI 그래프 snapshot과 인간 변경 버전을 분리한다.
- [알고리즘 평가 기준과 구현 명세 인계 조건 결정](issues/06-evaluation-and-handoff.md): AMI 기반 평가와 인간 검수된 서비스 gold를 분리하고 품질·비용 비교 및 한국어 검증 공백을 명시해 spec으로 인계한다.

## Not yet specified

구현 전에 인간과 결정할 fog는 남아 있지 않다. 기계적 스키마·저장/API 상세는 to-spec에서 합의한 계약을 구체화한다. 실제 데이터에서 드러날 추가 분기·모델/토큰/비용 보정은 평가 티켓의 측정·조정 계획을 따르며, 한국어 gold 준비와 품질 검증은 아직 완료되지 않았다.

## Out of scope

- 과거 결정 retrieval 및 입력 밖의 결정과 충돌·교체 분석: 사용자가 이번 범위를 입력 대화로 제한함.
- AI의 자동 확정·기존 Decision Record 변경: 사람이 최종 확정·교체함.
- FE 렌더링·좌표·ELK/React Flow 구현: BE 알고리즘과 논리 그래프까지만 설계함.
- 앱 구현, 운영 DB 마이그레이션, 배포, 실제 유료 AI 평가 실행: 설계 합의 후 별도 작업으로 진행함.
