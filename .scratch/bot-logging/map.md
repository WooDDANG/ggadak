# Wayfinder: Bot & Preprocessing Logging Enhancement

- **Feature**: `bot-and-preprocessing-logging`
- **Destination**: 봇의 수집/디바운스/전달 파이프라인과 백엔드 전처리 단계별 데이터 변환 흐름을 투명하게 추적할 수 있는 구조화된 멀티 레벨 로깅 체계 수립
- **Status**: decisions-complete (Ready for Spec & Tickets)

---

## Decisions

- [x] **01. Trace ID 및 상관관계 컨텍스트 전달 방식** — 봇 트리거 시점 `traceId` 발급 ➔ `X-Trace-Id` 헤더 전송 ➔ 백엔드 전처리 전체 공유 ([decisions/01-trace-id-and-correlation.md](./decisions/01-trace-id-and-correlation.md))
- [x] **02. 로그 레벨 정책 및 데이터 전처리 단계별 로깅 상세도** — `DEBUG`(발화 원본/제거 사유/트리 엣지/코사인 스코어) vs `INFO`(단계별 요약/소요시간/게이트 판정) ([decisions/02-log-levels-and-preprocessing-metrics.md](./decisions/02-log-levels-and-preprocessing-metrics.md))
- [x] **03. 듀얼 포맷터 및 파일/터미널 분리 구조** — 콘솔(이모지/컬러/ms 시각화 포맷) + 파일(`logs/combined.log`, `logs/error.log`, `logs/preprocessing.log` 전처리 전용 분리) ([decisions/03-dual-formatter-and-log-files.md](./decisions/03-dual-formatter-and-log-files.md))

---

## Next Steps
- 아키텍처 스펙(`.scratch/bot-logging/spec.md`) 작성
- TDD 구현 이슈 티켓(`.scratch/bot-logging/issues/`) 도출 후 순차 구현
