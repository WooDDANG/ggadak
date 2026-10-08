# Specification: App-Scoped Logging & Winston Labeling

- **Feature**: `app-scoped-logging-and-winston-labeling`
- **Destination**: 모노레포 루트에 섞여 있던 로그를 각 애플리케이션(`apps/bot`, `apps/be`)의 자체 `logs/` 디렉터리로 격리 분리하고, Winston 표준 `format.label`을 적용하여 출처 라벨을 명확히 하는 로깅 시스템 명세
- **Status**: Ready for Implementation

---

## Problem Statement

현재 모든 로그(`combined.log`, `preprocessing.log`, `error.log`)가 모노레포 루트 `logs/` 디렉터리에 하나로 뒤섞여 기록되고 있으며, Winston 공식 `format.label` 메커니즘을 거치지 않고 문자열 치환 방식으로 서비스명이 출력되고 있습니다. 이로 인해:
1. 디스코드 봇 개발 및 디버깅 시 백엔드 API 로그와 봇 수집 로그가 뒤엉켜 추적성이 떨어집니다.
2. 백엔드 전처리 및 의사결정 추출 로그 역시 봇 로그와 섞여 도메인 경계가 흐려집니다.
3. 각 애플리케이션의 독립적 배포 및 로그 수집기(Filebeat, CloudWatch 등) 설정이 어렵습니다.

---

## Solution

1. **Winston 표준 `format.label` 적용**:
   - `winston.format.label({ label: 'BOT' })` 및 `winston.format.label({ label: 'BE' })` 표준 파이프라인 구성.
   - 포맷터에서 `info.label` 속성을 기반으로 정확한 `[LABEL]` 태그를 터미널과 파일에 주입.
2. **앱 레포지토리 단위 격리된 로그 디렉터리 분리**:
   - **디스코드 봇 (`apps/bot`)**:
     - `apps/bot/logs/bot.log` (수집, 이벤트, 디바운스 일반 로그)
     - `apps/bot/logs/error.log` (봇 에러 전용)
   - **백엔드 (`apps/be`)**:
     - `apps/be/logs/be.log` (REST API, DB, 라우터 일반 로그)
     - `apps/be/logs/preprocessing.log` (5단계 전처리 및 의사결정 추출 전용 로그)
     - `apps/be/logs/error.log` (백엔드 에러 전용)
3. **루트 로그 오염 제거**:
   - 모노레포 루트 `logs/`에는 앱별 로그를 쓰지 않고, 각 앱 하위 디렉터리에서 독자적으로 로그 수명주기를 관리.

---

## User Stories

1. As a Bot Developer, I want Discord bot logs saved exclusively under `apps/bot/logs/bot.log`, so that I can monitor harvesting events without BE API log noise.
2. As a Backend Engineer, I want preprocessing pipeline logs saved in `apps/be/logs/preprocessing.log`, so that I can inspect the 5-stage transformation data in one dedicated file.
3. As an Operator, I want error logs separated per app (`apps/bot/logs/error.log` vs `apps/be/logs/error.log`), so that I can immediately tell which service threw an exception.
4. As a Developer, I want Winston to use official `format.label`, so that log aggregator integrations correctly parse the service label field.
5. As a Monorepo Maintainer, I want clean workspace root without mixed log dumps, so that each application owns its runtime artifacts.

---

## Implementation Decisions

1. `createLogger(serviceName, options)`:
   - `options.appDir`: 앱의 루트 디렉터리를 명시적으로 전달받거나 `serviceName` 접두사(`BOT-`, `BE-`)를 통해 자동으로 `apps/bot/logs` 또는 `apps/be/logs`를 해석.
   - `winston.format.label({ label: serviceName.toUpperCase() })`를 결합하여 Winston 표준 포맷터 적용.
2. 파일 트랜스포트 분기:
   - 봇 로거: `apps/bot/logs/bot.log`, `apps/bot/logs/error.log`
   - 백엔드 로거: `apps/be/logs/be.log`, `apps/be/logs/error.log`, `apps/be/logs/preprocessing.log`

---

## Testing Decisions

- 단위 테스트는 파일 시스템에 실제 격리된 디렉터리(`apps/bot/logs`, `apps/be/logs`)에 로그 파일이 생성되고 해당 라벨이 정확히 기록되는지 확인.
- 기존 모노레포 전체 테스트(`npm test`)가 깨지지 않고 All Green 유지.

---

## Out of Scope

- 외부 클라우드 로깅 서비스(Datadog, CloudWatch) 전송 SDK 연동.
