# BE 저장 모델·세션 병렬 처리: 수정 근거와 검증 기록

작성일: 2026-10-19

기준: `cf62c2b1eb5140fd4ccd9c9f72bf06c30125949a` 대비 현재 작업 트리. staged/unstaged 변경과 신규 `ai-call.repository.ts`를 함께 확인했다. 이후 코드가 바뀌면 이 검증 결과를 그대로 재사용하지 않는다.

## 판단 범위

이 문서는 [스펙](spec.md)의 변경을 현재 코드와 테스트로 설명하는 사후 검토 기록이다. 최초 구현 전에 이 근거를 모두 확인했다는 뜻은 아니다. 코드에서 관찰한 문제, 선택한 해결 방식, 실행한 검증, 남은 확인 사항을 구분한다.

스펙의 2026-10-17 DB 행 수·NULL 분포는 이번 작업에서 재측정하지 않았다. 따라서 이를 현재 운영 상태나 모든 환경의 상태로 인용하지 않는다. 운영 DB 변경과 외부 AI 호출도 수행하지 않았다.

## 변경별 근거

### 01 — 서비스 시작 전 스키마 준비 확인

- **기존 근거:** 기준 커밋의 loader는 일부 모델의 조회 성공으로 준비 상태를 확인했다. 이 방식만으로는 백그라운드 경로가 사용하는 테이블·컬럼까지 확인할 수 없다.
- **변경:** `assertStorageReady`가 Prisma 모델의 테이블·저장 컬럼 존재를 읽기 전용으로 확인하고 loader가 이를 호출한다. DB 도구는 대상 경로를 지정하고 점검·백업·이관한다.
- **검증:** `storage-readiness.test.ts`는 `AnalysisExecution`을 제거하면 점검이 실패하는지 확인한다. `database-tooling.test.ts`는 격리 DB의 스키마 점검, 백업 파일, 레거시 DB 업그레이드를 확인한다.
- **한계:** 테이블·컬럼 존재 확인은 타입·인덱스·모든 제약 조건의 동등성 증명이 아니다. 실제 배포 DB의 준비 여부는 별도 확인해야 한다.

### 02–06 — 저장 원본과 레거시 이관 경계 정리

- **기존 근거:** `DecisionRepository`는 `domainJson`이 있으면 JSON을, 없으면 여러 컬럼을 조합해 읽었다. 쓰기에서도 본문·근거·참여자 등을 JSON과 컬럼에 함께 저장했다. `saveFeedback`은 채널 ID를 `decisionId`에, source를 `author`에 중복 기록했다.
- **변경:** Decision은 검증한 versioned domain payload를 기준으로 읽고, 조회용 컬럼은 같은 쓰기 경계에서 파생한다. External Feedback은 채널 중심 필드로 저장한다. 제거할 컬럼과 과거 값은 `StorageArchive`에 보존한 뒤 expand/data/contract 순서로 이관한다.
- **선택 이유:** 사용되지 않는 표현을 계속 병행하면 두 저장 형식의 일관성을 계속 유지해야 한다. 이관을 먼저 하고 이전 읽기 경로를 제거하면 그 부담을 줄일 수 있다. 조회용 컬럼은 검색 목적이 있어 유지한다.
- **검증:** `repositories/migration.test.ts`는 레거시 fixture를 실제 migration으로 이관하고, 과거 `archivedAt`·feedback author 보존, 거절 Evidence Hash 유지, feedback 조회, 이전 컬럼 제거를 확인한다. `storage-audit.test.ts`는 원본과 파생 컬럼을 일부러 어긋나게 만들었을 때 탐지하는지 확인한다.
- **대가와 한계:** contract 적용 후 구버전 BE와의 호환성이 끊긴다. 격리 fixture의 이관 성공은 실제 데이터 전체의 변환·복원 성공을 보장하지 않는다. 운영 적용에는 대상 DB 백업, 데이터 audit, 정지 시간과 복원 검증이 필요하다. [운영 절차](../../docs/be-storage-operations.md)를 따른다.

### 07–08 — 관계 조회와 참조 무결성

- **기존 근거:** 기준 커밋의 `history()`는 후보 이력마다 전체 `CandidateAnalysis`를 읽고 `relatedJson`을 파싱해 역방향 관계를 찾았다. `getGraph()`는 연결된 Decision을 노드별로 조회했다.
- **변경:** 후보 관계를 역방향 인덱스가 있는 `CandidateRelation`으로 옮기고, 그래프의 현재 version은 모아서 조회한다. 후보·분석·검수 이력 참조에는 restrictive foreign key를 사용한다.
- **선택 이유:** 조회할 관계를 DB 조건으로 좁히고, 참조 대상이 없는 이력을 저장하거나 대상 삭제로 이력을 잃는 경우를 제한한다. 분석 당시 graph snapshot과 현재 version 대조는 유지한다.
- **검증 범위:** migration 테스트는 존재하지 않는 Decision을 참조하는 `DecisionEdit` 저장이 실패하는지 확인한다. 기존 분석 API 회귀 테스트도 실행한다. 모든 참조 제약·삭제 경합과 대규모 데이터의 조회 성능을 검증한 것은 아니다. 쿼리 구조 개선을 실제 응답 시간 개선 수치로 표현하지 않는다.

### 09 — 불변 분석 입력과 세션 체크포인트 분리

- **기존 근거:** 기준 커밋의 `checkpoint()`는 매번 전체 workflow와 입력을 request 한 행에 썼다. 세션 병렬화를 추가하면서 이 저장 단위를 그대로 쓰면 독립 세션도 동일한 전체 상태 쓰기에 결합된다.
- **변경:** 불변 세션 입력과 가변 상태를 분리하고 세션별 행을 갱신한다. 소유권·lease 조건을 확인한 transaction과 요청 내부 쓰기 대기열을 사용한다. 기존 version-1 workflow는 재개할 때 변환한다.
- **검증:** `analysis-checkpoints.test.ts`는 version-1 변환, 입력 보존, 두 세션의 독립 상태 저장을 확인한다. 병렬 세션 테스트는 실패 후 완료 세션을 다시 추출하지 않고 재사용하는지 확인한다.
- **한계:** 장시간 프로세스 정지, lease 만료와 소유권 이전의 모든 순서를 이번 신규 테스트 하나로 입증하지 않는다.

### 10–11 — 전역 AI 호출 상한과 독립 세션 병렬화

- **기존 근거:** 기준 커밋의 분석 서비스는 세션을 `for` 루프로 순차 실행하고 각 단계에서 직접 AI를 호출했다. 세션 worker 수만 늘리면 여러 요청·프로세스의 합산 AI 호출 수를 제한할 수 없다.
- **변경:** 요청 내 세션 worker 수와 같은 DB를 사용하는 프로세스의 AI 호출 상한을 분리한다. DB lease로 호출 허가를 공유하고, 슬롯 대기와 실제 AI 시간을 나눈다. 호출을 취소하면 실행 종료를 기다린 뒤 허가를 반환한다. 한 세션의 실패 시 다른 worker를 취소·정리하고 전체 결과를 게시하지 않는다. live 평가 경로도 scheduler를 전달한다.
- **선택 이유:** 독립 세션은 겹쳐 실행할 수 있지만 세션 내부 단계 순서, 재시도 예산, 동일 채널 직렬화, 최종 게시 경계는 유지해야 한다. 기본값 1로 순차 동작을 보존하고 측정 후 설정을 올릴 수 있게 한다.
- **검증:** `ai-call-scheduler.test.ts`는 같은 DB의 두 Prisma client에서 합산 상한 2와 취소된 대기자의 정리를 확인한다. `parallel-sessions.test.ts`는 worker 3/호출 상한 2에서 겹친 실행, 결과 순서, 실패 시 실행 정리·미게시·완료 세션 재사용을 확인한다.
- **한계:** 두 client 테스트는 OS 프로세스 강제 종료 시험이 아니다. 서로 다른 DB를 쓰는 프로세스·외부 앱은 이 상한을 공유하지 않는다. 실제 CLI의 종료 지연, lease 상실과 계정 할당량은 별도 검증이 필요하다.

### 12 — 병렬 수를 정하기 위한 측정 도구

- **근거:** 코드 구조만으로 실제 계정·모델·배포 자원에 맞는 병렬 수를 결정할 수 없다. worker 증가가 처리량 개선으로 이어지는지도 측정 대상이다.
- **변경:** N=1을 포함한 후보를 동일 workload에서 실행하고 완료 처리량, 요청 완료 지연, 슬롯 대기, 오류, DB·프로세스 자원과 선택적 서비스 probe를 비교한다. 제한을 만족하는 후보 중 최고 처리량의 5% 이내인 최소 N을 고르는 규칙을 제공한다.
- **검증:** `concurrency-benchmark.test.ts`는 선택 규칙, 누락된 자원/probe 측정 제외, 순차 세션 전체의 최종 commit까지 포함하는 완료 지연을 확인한다.
- **한계:** 5%는 구현한 선택 정책이며 실측으로 증명한 보편 최적 기준이 아니다. 이번에는 실제 AGY 비교 측정을 하지 않았으므로 운영 권장 N과 실서비스 처리량 개선 주장을 만들지 않는다. 티켓 12의 `resolved`는 도구 구현 근거로만 읽어야 하며 운영값 선정 완료로 읽어서는 안 된다.

## 실행한 검증

환경: 로컬 작업 트리, 테스트용 임시 SQLite DB, mock/fixture AI. 테스트 설정은 작업 DB 대신 주입된 repository를 사용하고 외부 네트워크 호출을 차단한다.

```bash
npm run test --workspace=@ggaddak/be -- tests/storage-readiness.test.ts tests/storage-audit.test.ts tests/database-tooling.test.ts tests/repositories/migration.test.ts tests/analysis-checkpoints.test.ts tests/ai-call-scheduler.test.ts tests/parallel-sessions.test.ts tests/concurrency-benchmark.test.ts
```

결과: 8개 파일, 11개 테스트 통과, 종료 코드 0.

```bash
npm run typecheck --workspace=@ggaddak/be
```

결과: BE 소스와 테스트 TypeScript 검사 통과, 종료 코드 0.

```bash
npm run test --workspace=@ggaddak/be -- tests/repositories/decision.repository.test.ts tests/agentic-analysis.api.test.ts tests/decision-timeline.test.ts tests/evaluation-runner.test.ts tests/analysis-queue.test.ts
```

결과: 5개 파일, 28개 테스트 통과, 종료 코드 0. 저장 후 재시작, 검수 version 경계, 분석 단계 복구·원자적 게시·인간 편집 후 그래프 보존, timeline 조회, fixture 평가, Durable Receipt와 Analysis Queue의 기존 동작을 확인했다.

합계: 13개 테스트 파일의 39개 테스트와 BE 타입 검사 통과. 전체 모노레포 테스트, 전체 build/lint, 실제 provider 실행은 수행하지 않았다.

## 완료 판단에 남은 조건

- 실제 운영 DB의 현재 스키마·데이터 audit, 백업 복원과 배포 후 API 확인.
- 실제 AGY 계정·모델·입력·호출 예산을 명시한 N=1 대비 비교 측정과 운영값 선택. 그 전에는 기본값 1을 유지한다.
- 별도 프로세스 종료·lease 복구와 기존 scan-backpressure 부하·복구 통합 검증. 단위별 테스트 통과를 이 결과로 대체하지 않는다.
- 저장 모델 변경과 병렬 처리 변경은 검토 목적이 다르므로 각각의 근거와 검증을 확인한다. 이 문서의 존재만으로 현재 큰 변경 묶음의 리뷰가 완료되지는 않는다.
