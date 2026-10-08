# Issue 01: Winston Standard Labeling (`format.label`) Implementation

- **Category**: core-logging
- **Status**: Open
- **Spec Reference**: `../spec-app-scoped-logging.md`

## Summary
`packages/shared/src/logger.ts`에서 Winston의 공식 `winston.format.label({ label: ... })` 포맷터를 사용하여 `info.label` 기반의 표준 라벨 출력을 지원하도록 수정합니다.

## Requirements
1. `createLogger(serviceName, options)`에서 `serviceName`을 기반으로 Winston의 `format.label({ label: serviceName.toUpperCase() })`를 포맷 파이프라인에 결합.
2. 터미널 콘솔 포맷 및 파일 포맷에서 `info.label`을 명시적으로 활용하여 `[LABEL]` 태그를 출력.
3. 단위 테스트 작성: `packages/shared/src/logger.test.ts`에서 생성된 로그에 `label` 프로퍼티 및 포맷 문자열이 올바르게 기록되는지 검증.
