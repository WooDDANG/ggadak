# Backend Review Follow-up

Status: resolved

## Scope

2026-10-13 `git diff HEAD~20...HEAD` 코드 리뷰 후 사용자가 요청한 후속 작업이다. Review 정책을 다시 분리하고 분석 요청을 공통 입력 계약으로 변경하며, FE 렌더링 누락을 제외한 동기화 결함을 수정한다. 구현과 회귀 검증을 완료했다. 검증 결과는 [verification.md](verification.md)에 기록한다.

기준점: `8d12ef23de4f40e304bf83c0e196cd0e3dce000d`. 기존 요구사항은 [ADR-0021](../../docs/adr/0021-backend-layered-architecture-and-vitest.md), [Web-owned review](../../docs/adr/0019-web-owned-decision-review.md), [동기화 티켓](../v1-api-model-renewal/issues/09-manual-sync.md)을 따른다.

## Tickets

- [01: Review 정책 Service 이관](issues/01-review-policy-service-boundary.md)
- [02: 분석 공통 입력·결과 계약](issues/02-common-analysis-contract.md)
- [03: 재시작 후 Sync Job 진행 집계](issues/03-sync-restart-progress.md)
- [04: Sync Job 임대 갱신과 중복 방지](issues/04-sync-lease-and-exclusivity.md)

## Boundaries

FE 코드와 화면은 작업 범위에서 제외한다. 현재 공개 API 계약과 기존 review 기능을 보존하고, 변경이 필요한 내부 계약은 BE/Bot에서 함께 수정한다. 운영 DB 변경·배포는 포함하지 않는다. 스키마 변경이 필요하면 additive migration과 격리 DB 검증을 제공한다. 실제 Discord/AI 호출 대신 주입된 어댑터를 사용한다.

각 티켓은 독립적으로 착수할 수 있다. 03과 04는 Sync Job 모델·서비스·Bot worker를 공유하므로 동일 파일 수정은 순차 통합한다.
