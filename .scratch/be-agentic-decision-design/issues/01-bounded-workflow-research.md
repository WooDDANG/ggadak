# 입력 대화 분석에 적합한 제한된 Agentic 워크플로우 조사

Type: research
Label: wayfinder:research
Status: resolved
Assignee: agentic_workflow_research
Blocked by: none
Parent: [BE Agentic 의사결정 분석 설계](../map.md)

## Question

현재 TypeScript BE와 요청 멱등성·인간 검수 경계를 유지하면서 추출 → 검증 → 수정의 제한된 워크플로우를 구성하는 선택지는 무엇인가? 기존 연구 문서의 가정 중 실제 1차 출처가 뒷받침하는 것과 검증되지 않은 주장을 구분하고, 단계의 구조화 출력·예산·종료·실패 처리 및 논리 그래프 정합성 검증에 대한 사실을 조사한다.

이 조사는 구현 방식이나 모델을 채택하지 않는다. 고정 워크플로우와 동적 agent, 단일 추출기와 역할 분리, 제한된 수정과 재시도의 차이를 비교한다. Python 도입이나 프레임워크 채택을 전제하지 않는다. 원문 출처가 없는 요약도 허용하지만 입력 대화 밖 retrieval과 자동 확정은 제외한다.

## Assets

- [출발 연구 문서](../../../docs/research/ai-agentic-decision-visualization.md)
- [워크플로우 설계 선택지 조사](../../../docs/research/be-agentic-decision-workflow-options.md)

## Comments

조사 결과는 관측 사실·출처·불확실성과 선택지로 기록하며 인간의 설계 결정을 대신하지 않는다.

## Answer

2026-10-13 공식 자료 조사를 완료했다. 고정 TypeScript workflow, 단일 추출 + 코드 검증, critic + 제한된 수정, 노드·관계 역할 분리, 동적 orchestrator를 비교할 수 있다. Python·LangGraph 도입은 필수가 아니다. 구조화 출력은 의미 정확성·원문 사실성·그래프 참조 무결성을 보장하지 않으며 refusal·미완료 처리가 별도로 필요하다. 논리 그래프 검증과 실행 그래프 종료 제약은 서로 다른 계약이다.

기존 연구의 수정 3회와 합의점수 0.85는 조사한 공식 자료의 공통 기본값이 아니며 한국어 대화 실험도 없다. 구체적인 단계, 모델, 임계치, 부분 제출 여부는 이번 조사에서 채택하지 않았다. 상세 근거·불확실성은 위 조사 문서에 보존한다.

Context: 독립 worktree `/private/tmp/ggaddak-agentic-workflow-research`, 커밋 `82df32c`, [research/be-agentic-decision-workflow 브랜치](https://github.com/WooDDANG/ggadak/tree/research/be-agentic-decision-workflow). 원격 push 완료; PR 없음, 구현 브랜치에 병합하지 않는다. 공유 workspace에는 조사 문서의 동일 사본을 남겼으며 앱 코드는 변경하지 않았다.
