# BE 스토리지 모델 리팩토링 및 세션 병렬 처리 분석 리포트

- **작성일**: 2026-10-24
- **대상 브랜치**: `feat/be-storage-parallel-sessions`
- **기준 커밋**: `cf62c2b` 대비 작업 트리 (Staged/Unstaged 및 신규 추가 모듈 전체)
- **관련 문서**: [ADR-0025](../adr/0025-versioned-storage-and-session-concurrency.md), [운영 가이드](../be-storage-operations.md), [스펙 및 검증 기록](../../.scratch/be-storage-refactoring/spec.md)

---

## 1. 개요 및 목적 (Executive Summary)

본 리팩토링은 GGADDAK 백엔드(`@ggaddak/be`)의 **저장소 데이터 모델 정리**와 **분석 세션 병렬 처리 체계 구축**을 목표로 수행되었습니다.

기존 백엔드는 SQLite 및 Prisma를 사용하면서도 다음과 같은 구조적 한계와 비효율을 안고 있었습니다:
1. **저장 원본과 프로젝션의 불일치**: `Decision` 엔티티가 `domainJson`과 개별 컬럼(본문, 참여자, 제약조건 등)에 중복 저장되어 읽기/쓰기 시 데이터 정합성 유지 비용 발생.
2. **미사용 및 잘못된 메타데이터**: 모든 값이 `NULL`인 `archivedAt`, 설정과 중복된 `configJson`, 채널 ID를 `decisionId`에 기록하던 `ExternalFeedback` 등 도메인 의미와 맞지 않는 데이터 잔존.
3. **비효율적인 관계 조회 및 참조 무결성 부재**: 후보 이력 간 역방향 관계 탐색 시 전체 행과 JSON 풀스캔 수행, 외래키 제약조건 미비로 삭제/수정 시 참조 무결성 취약.
4. **거대 단위 체크포인트 저장**: 불변 입력과 가변 실행 상태가 하나의 `AnalysisRequest` 레코드에 결합되어 세션 병렬 처리 시 쓰기 충돌 발생.
5. **순차 실행에 따른 처리량 제한**: 토론 분석 세션들이 직렬(`for` 루프)로 실행되어 처리 시간이 길어지고, 반대로 단순 병렬화 시 전역 LLM(AGY) 호출 할당량 초과 위험 존재.

이번 작업을 통해 **Expand-Data-Contract 3단계 무중단 마이그레이션 패턴**, **불변 입력과 세션별 가변 체크포인트 분리**, **전역 FIFO 분산 AI 호출 스케줄러**, **측정 기반 N개 세션 병렬화 파이프라인**, 그리고 **서비스/레포지토리 계층 분리**가 구현되었습니다.

---

## 2. 세부 아키텍처 및 구현 분석

### 2.1 스토리지 모델 정규화 및 데이터 무결성 (Expand-Data-Contract)

#### (1) Decision 도메인 원본 단일화
- **도메인 권위(Authority) 확립**: 버전 관리된 `domainJson`을 유일한 정본(Single Source of Truth)으로 지정하고, 색인 및 조회용 컬럼(`decisionContent`, `decisionType`, `state` 등)은 동일 쓰기 경계에서 파생된 프로젝션(Projection)으로 관리합니다.
- **데이터 감사 도구(`storage-audit.ts`)**: 정본인 `domainJson`과 파생 컬럼 간의 불일치가 발생하는지 감지하는 감사 로직을 구현하여 데이터 왜곡을 사전에 탐지합니다.

#### (2) 미사용 메타데이터 정리 및 `StorageArchive` 격리
- 애플리케이션에서 읽지 않는 `archivedAt`, 중복된 `configJson`, 이전 버전의 피드백 메타데이터 등을 본 테이블에서 제거하되, 데이터 유실 방지를 위해 `StorageArchive` 테이블에 안전하게 백업 및 보존합니다.
- `StorageArchive`는 라이브 엔티티와 무관한 독립적 수명주기를 가지며, 캐스케이드 삭제되지 않는 순수 복원용 아카이브 역할을 수행합니다.

#### (3) External Feedback 저장 계약 정상화
- 기존에 `decisionId` 컬럼에 Discord 채널 ID를 오용하던 방식을 전면 개편했습니다.
- 피드백 테이블을 `channelId`, `channelScope`, `externalAuthor` 중심의 채널 기반 도메인 모델로 재설계하여 도메인 의미를 복원했습니다.

#### (4) CandidateRelation 도입 및 Restrictive 외래키
- 기존 `CandidateAnalysis.relatedJson` 필드를 파싱하여 역방향 관계를 찾던 O(N) 순회 방식을 폐기했습니다.
- 명시적인 인덱스를 갖는 `CandidateRelation` 관계 테이블을 신설하여 양방향 조회를 최적화했습니다.
- `Decision`, `DecisionCandidate`, `DecisionEdit`, `CandidateAnalysis` 간의 관계에 `RESTRICT` 외래키 정책을 부여하여 부모 레코드 삭제 시 발생할 수 있는 이력 고아 현상을 원천 차단했습니다.

#### (5) 3단계 마이그레이션 전략
- `202610170002_storage_expand`: 신규 테이블(`CandidateRelation`, `StorageArchive`, `AnalysisSessionState`) 및 확장 컬럼 추가.
- `202610170003_storage_data`: 레거시 데이터를 신규 정본 포맷으로 변환하고 과거 데이터를 아카이브 테이블로 안전하게 이관.
- `202610170004_storage_contract`: 레거시 컬럼을 제거하고 최종 제약조건 및 외래키 적용.

---

### 2.2 불변 분석 입력과 세션 체크포인트 분리 (Session Checkpointing)

- **상태 분리 (`AnalysisRequest` vs `AnalysisSessionState`)**:
  - `AnalysisRequest`: 변경되지 않는 원본 요청 파라미터, 워크플로 명세, 전역 분석 메타데이터를 유지.
  - `AnalysisSessionState`: 세션별 불변 전처리 입력(`preprocessedInputJson`)과 가변 실행 상태(`checkpointJson`)를 분리하여 세션 단위 레코드로 저장.
- **병렬 세션 쓰기 격리**:
  - 세션별 레코드 업데이트 및 요청 로컬 쓰기 큐(`request-local write queue`)를 도입하여 여러 세션이 동시에 체크포인트를 기록할 때 발생하는 락 경합 및 덮어쓰기 충돌을 방지합니다.
  - 임대(Lease) 기반 펜싱 토큰을 검증하여 이전 실행자의 지연된 쓰기를 방지합니다.
- **하위 호환성 (V1 복구 지원)**:
  - 기존 Version-1 단일 행 워크플로 데이터가 존재하는 경우, 재개(Resume) 시점에 원자적으로 신규 세션 상태 테이블로 변환하여 중단 없이 분석을 이어갈 수 있습니다.

---

### 2.3 전역 AI 호출 스케줄러 (`AiCallScheduler`)

- **프로세스 간 전역 상한 제어**:
  - 백엔드 인스턴스가 여러 개 실행되거나 동일 DB를 공유하는 상황에서, 전체 AI 호출 수가 프로바이더의 쿼터 상한(`AI_CALL_CONCURRENCY`)을 초과하지 않도록 SQLite 기반 임대 테이블(`aiCallLease`)과 제어 락(`analysisQueueControl`)을 사용하여 분산 FIFO 스케줄링을 구현했습니다.
- **슬롯 대기 시간과 AI 실행 시간의 엄격한 분리**:
  - 스케줄러 대기열에서 슬롯을 획득하기까지의 지연(Permit Wait Time)과 실제 LLM 호출 소요 시간(Active AI Stage Time)을 분리 계측하여 모니터링 정확도를 높였습니다.
- **빠른 실패(Fail-fast) 및 자식 프로세스 정리**:
  - 분석 세션 중 하나가 실패하거나 요청이 취소되면, 큐에 대기 중인 작업을 즉시 제거하고 실행 중인 형제 세션 worker에게 취소 신호(SIGTERM/SIGKILL)를 전파합니다.
  - CLI 프로세스의 자식 프로세스 트리까지 완전히 종료된 것을 확인한 후 점유했던 허가(Permit)를 반환합니다.
  - 부분적으로 생성된 후보 결정이 외부에 불완전하게 노출되지 않도록 원자적 게시(Atomic Publication) 경계를 유지합니다.

---

### 2.4 설정 가능한 N개 세션 병렬화 및 벤치마크 도구

#### (1) 3계층 동시성 설정
환경 변수를 통해 세밀한 동시성 제어가 가능하도록 정책을 계층화했습니다:
- `ANALYSIS_CONCURRENCY` (기본값 1, 범위 1~32): 백엔드 전역에서 동시 수락 가능한 분석 요청 수.
- `AI_SESSION_CONCURRENCY` (기본값 1, 범위 1~32): 단일 분석 요청 내에서 병렬로 실행할 독립 세션 워커 수.
- `AI_CALL_CONCURRENCY` (기본값 1, 범위 1~32): 동일 DB를 공유하는 전체 프로세스에서 동시에 실행 가능한 실제 AI 호출 수.

#### (2) 벤치마크 캘리브레이션 (`concurrency-benchmark.ts`)
- **실측 기반 N 선정**: 단순한 하드코딩이나 추측이 아닌, 실제 부하 시나리오에서 N(1, 2, 4 등)에 따른 처리량을 측정하여 최적의 운영값을 도출합니다.
- **다각도 지표 수집**:
  - 완료 세션/분 (Throughput)
  - 요청 완료 지연 및 허가 대기 지연 (p50, p95)
  - DB 트랜잭션 락 지연 및 에러 수
  - 프로세스 트리 메모리(RSS) 및 CPU 사용률 샘플링
  - 서비스 헬스 프로브 응답 지연 (API 성능 간섭 측정)
- **최소 N 선정 정책**: 모든 리소스 상한(에러율 0%, 메모리/CPU/지연 한도)을 만족하는 후보 중, **최대 처리량의 5% 이내에 도달하는 가장 작은 N**을 최종 권장값으로 선정합니다 (불필요한 리소스 낭비 및 잠재적 경합 방지).

---

### 2.5 서비스 및 레포지토리 계층 고도화

기존에 `discussion.service.ts`에 집중되어 있던 거대 비즈니스 로직을 단일 책임 원칙(SRP)에 따라 다음과 같이 분리했습니다:
1. `CandidatePublicationService`: 후보 결정의 동등성 판별, 거절 이력 대조를 통한 중복 억제, 결정 그래프 링크 연결 및 원자적 커밋 전담.
2. `AnalysisQueryService`: 분석 결과 조회, 그래프 버전 대조, 후보 이력 질의 담당.
3. `AnalysisRunner`: 워크플로 단계 실행, 세션 분할 및 에러 처리 담당.
4. `AiCallRepository`: 임대 및 동시성 큐 제어 쿼리 캡슐화.
5. `analysis-identity.ts`: 객체 키 순서에 무관한 안정적인 JSON 직렬화(`stableJson`) 및 SHA-256 해시 함수 구현 (`legacyHash` 및 정합성 검증에 사용).

---

## 3. 운영 및 마이그레이션 도구 (Operations & Tooling)

백엔드 스토리지 관리를 위해 표준화된 npm 스크립트와 Python 기반의 안전한 CLI 도구가 제공됩니다:

| 명령어 | 도구 경로 | 주요 역할 |
|---|---|---|
| `npm run db:check` | `scripts/database.mjs` | 선택된 SQLite 경로 확인, 미적용 마이그레이션 탐지, 테이블/컬럼 존재 검증 |
| `npm run db:upgrade` | `scripts/storage-database.py` | 사전 백업 자동 생성, 레거시 데이터 배치 백필, Expand-Data-Contract 마이그레이션 적용 |
| `npm run db:backfill` | `scripts/storage-database.py` | 계약(Contract) 단계 전 대량 레거시 데이터의 배치 백필 선행 실행 |
| `npm run db:audit` | `src/scripts/storage-audit.ts` | 도메인 JSON 원본과 검색용 파생 컬럼 간의 불일치 무결성 검증 |
| `npm run ai:benchmark` | `src/evaluation/concurrency-benchmark.ts` | 오프라인 픽스처 및 라이브 AGY 환경 동시성 측정 및 최적 N 권장 도출 |

### 안전 운영 원칙
- **일관된 백업 필수**: 마이그레이션 실행 전 SQLite의 공식 백업 API를 활용하여 일관된 스냅샷을 생성합니다. (WAL 파일 누락 방지)
- **롤백 절차 명시**: 마이그레이션 또는 감사 실패 시 자동 복구 대신 이전 백업 파일을 복원하고 직전 BE 바이너리를 배포하도록 안전장치를 마련했습니다.

---

## 4. 검증 및 테스트 결과 (Verification)

### 4.1 Vitest 단위 및 통합 테스트 결과
전체 41개 테스트 스위트, 135개 테스트가 전원 통과했습니다:
- **스토리지 준비성 검사** (`tests/storage-readiness.test.ts`): 누락된 테이블/컬럼 사전 감지 확인.
- **데이터베이스 도구 검사** (`tests/database-tooling.test.ts`): 명시적 백업 생성 및 레거시 업그레이드 경로 검증.
- **마이그레이션 무결성 검사** (`tests/repositories/migration.test.ts`): 레거시 픽스처의 정상 이관, `StorageArchive` 보존, 구버전 컬럼 삭제 확인.
- **스토리지 감사 검사** (`tests/storage-audit.test.ts`): 의도적 프로젝션 불일치 주입 시 감사 로직의 즉각적 탐지 확인.
- **체크포인트 분리 검사** (`tests/analysis-checkpoints.test.ts`): 불변 입력 보존 및 독립 세션 상태 저장, V1 포맷 자동 변환 확인.
- **AI 호출 스케줄러 검사** (`tests/ai-call-scheduler.test.ts`): 복수 클라이언트 간 상한 준수 및 취소 슬롯 즉시 반환 확인.
- **세션 병렬 처리 검사** (`tests/parallel-sessions.test.ts`): N개 워커 환경에서 세션 병렬 실행, 실패 시 미게시 보장 및 성공 세션 재활용 확인.
- **동시성 벤치마크 검사** (`tests/concurrency-benchmark.test.ts`): 5% 룰 기반의 최적 N 도출 알고리즘 검증.

### 4.2 TypeScript 정적 검사
- `npm run typecheck --workspace=@ggaddak/be`: 타입 에러 0건 통과.

---

## 5. 결론 및 향후 권장사항 (Next Steps)

본 작업은 단일 노드 SQLite 환경에서 데이터 무결성을 보장하면서도 AI 분석 파이프라인의 처리 성능을 극대화할 수 있는 탄탄한 엔지니어링 기반을 마련했습니다.

### 운영 및 배포 시 권장사항:
1. **운영 DB 마이그레이션 시 점검**:
   - 운영 배포 전 반드시 `npm run db:check` 및 `npm run db:upgrade -- --database <경로>`(드라이런)를 통해 상태를 점검하십시오.
   - Expand ➔ Data ➔ Contract 단계 중 Contract 단계가 완료되면 이전 버전의 백엔드는 호환되지 않으므로 서비스 정지 시간(Maintenance Window)을 계획하십시오.
2. **실제 AGY 계정 기반 벤치마크 실행**:
   - 현재 구현된 N=1(순차 실행) 기본값을 유지하고, 스테이징 또는 운영 환경에서 실제 AGY CLI 계정과 입력 데이터셋을 대상으로 `npm run ai:benchmark -- --live ...`를 수행하여 안전한 N값을 도출한 후 `AI_SESSION_CONCURRENCY`를 상향 조정하십시오.
3. **지속적인 스토리지 감사**:
   - 정기적인 크론 작업 또는 배포 파이프라인에 `npm run db:audit`을 연결하여 도메인 원본과 프로젝션 컬럼의 일관성을 상시 점검하는 것을 권장합니다.
