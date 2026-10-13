# 02: 분석 요청·결과를 공통 계약으로 정리

Type: task
Status: resolved
Priority: P2
Blocked by: none

## Problem

`apps/be/src/services/discussion.service.ts`의 `AnalyzeDiscussionParams`와 `apps/be/src/dto/discussion.dto.ts`의 `AnalyzeDiscussionRequestDto`가 request ID, 메시지, guild/channel, trigger, score 등을 중복 정의한다. Service만 `rawMessages: any[]`를 사용한다. `analysis-request.repository.ts`는 Service에서 입력·결과 타입을 가져와 역방향 의존을 만든다.

## Scope

- Service·Repository가 함께 사용하는 분석 입력·결과와 메시지 타입을 Service 및 HTTP DTO에 의존하지 않는 공통 도메인 계약으로 정의한다.
- DTO는 공통 계약을 참조하거나 명시적으로 매핑하며, Zod 입력 검증과 TSOA 생성 호환성을 유지한다.
- Service 내부 중복 선언 및 Repository → Service 타입 의존을 제거한다. Repository가 HTTP DTO에 직접 의존하는 형태로 대체하지 않는다.
- raw message의 ID, author, content, timestamp, reply, reaction 및 trigger 정보를 구체적인 타입으로 보존한다.

## Acceptance

- [x] 분석 입력·결과의 공통 필드는 단일 계약에서 관리되고 Service와 Repository가 해당 계약을 사용한다.
- [x] Repository는 Service/HTTP DTO/Zod를 가져오지 않고 분석 메시지에 `any[]`를 쓰지 않는다.
- [x] request fingerprint, canonical evidence, 중복 요청 재생, manual reanalysis와 candidate history 동작이 유지된다.
- [x] 잘못된 요청은 기존 오류 계약으로 거절되고 유효한 요청의 응답 구조는 유지된다.
- [x] BE typecheck 및 기존 discussion/analysis 회귀 테스트가 통과한다. 생성 스펙과 기존 공개 계약의 호환성을 확인하고 FE 파일은 수정하지 않는다.

## References

[후속 스펙](../spec.md), [ADR-0021](../../../docs/adr/0021-backend-layered-architecture-and-vitest.md), [분석 식별성 요구사항](../../project-reliability-repair/spec.md).

## Answer

domain/analysis.ts에 메시지·분석 입력·결과 계약을 정의했다. DTO와 Service·Repository가 공통 계약을 참조하며 Repository → Service 타입 의존과 rawMessages any[]를 제거했다. DTO 파싱이 제거하던 비계약 필드 참조를 정리하고 생성 OpenAPI의 wire 계약 호환성을 확인했다. FE 파일은 변경하지 않았다.

검증: [verification.md](../verification.md).
