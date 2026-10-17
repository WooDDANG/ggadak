# 12: AGY 호출을 전용 AgyProvider로 분리

**Status:** resolved

## 목표

BE의 AI 실행 경로를 AGY CLI 하나로 명확히 하고, 공급자 호출 세부사항을 `AgyProvider`에 캡슐화한다. 그래프 분석 workflow가 AGY CLI의 실행 방식이나 응답 형식에 직접 의존하지 않게 한다.

## 범위

- `IAiAdapter`의 추출·검증·수리 계약과 `GraphWorkflow` 호출 흐름을 유지한다.
- `AiAdapter`는 단계별 모델·프롬프트·스키마 선택 및 공통 검증을 조율하고, 공급자 호출은 `AiProvider` 계약을 통해 위임한다.
- `AgyProvider`가 AGY CLI 요청 구성, `agy-cli` 전송 호출, 구조화 응답 파싱, usage 전달 및 AGY 오류를 애플리케이션 오류로 매핑하는 책임을 맡는다.
- 기존 `agy-cli.ts`의 프로세스 격리·취소·정리 동작과 AGY 전용 스키마 변환을 보존한다.
- 런타임 기본 경로는 AGY 하나로 제한한다. 사용되지 않는 직접 Gemini/OpenAI 생성 경로, 관련 생성 설정과 분기는 정리한다. OpenAI 임베딩 경로는 이 티켓의 범위가 아니다.
- `evaluation/runner.ts`의 `generateStructured()` 직접 사용은 평가기가 공급자 구현에 의존하지 않도록 정리한다. 평가 전용 요청 포트 또는 공통 구조화 호출 포트를 사용하되 평가 요청의 동작을 보존한다.
- 필요한 경우 AGY 전송 또는 provider 인스턴스를 주입할 수 있게 해 외부 CLI 호출 없는 단위 테스트를 작성한다.

## 완료 조건

- [x] `GraphWorkflow`와 서비스는 `IAiAdapter` 계약만 사용하며 AGY CLI 세부사항을 참조하지 않는다.
- [x] `AiAdapter`에 Gemini/OpenAI HTTP 요청·응답 분기와 API별 스키마 변환 코드가 남지 않는다.
- [x] `AgyProvider`가 AGY 실행 요청·스키마 변환·usage 한도를 담당하고, `agy-cli`가 프로세스 protocol을 처리한다.
- [x] 설정과 문서가 BE 분석 공급자는 AGY임을 일관되게 나타내며, OpenAI 임베딩 설정은 영향받지 않는다.
- [x] 평가 runner는 `AiAdapter`의 공개 workflow 계약을 우회해 내부 생성 메서드를 호출하지 않는다.
- [x] AGY 성공 응답, 잘못된 구조화 응답, 로그인/실행 실패, 할당량 오류, 취소·timeout이 기존 의미로 전달되는 테스트가 통과한다.
- [x] 전체 BE 테스트, 타입 검사 및 lint가 통과한다.

## 제외

새 AI 공급자 추가, 모델/프롬프트 동작 변경, workflow 상태 전이 변경, 실서비스 AI 호출 및 배포.

## Answer

2026-10-17: `AiProvider` 계약과 `AgyProvider`를 추가하고, `AiAdapter`에서 단계별 프롬프트·모델 선택/공통 검증 후 provider에 위임하도록 정리했다. Gemini/OpenAI 직접 생성 경로와 API key 설정을 제거했으며, OpenAI 임베딩 경로는 유지했다. 평가 baseline도 같은 provider 경계를 사용하고 명시적인 호출·토큰 예산을 CLI 실행 전에 예약한다.

BE 테스트 123개, 공유 테스트 15개, E2E 8개, typecheck와 lint를 확인했다. Lint는 기존 `packages/shared/src/logger.test.ts`의 미사용 import 경고 1개만 남는다. 자동 리뷰 스킬은 병렬 에이전트 실행을 요구하지만 현재 세션은 에이전트 위임을 허용하지 않아, 변경 diff와 티켓 기준으로 수동 리뷰했다.
