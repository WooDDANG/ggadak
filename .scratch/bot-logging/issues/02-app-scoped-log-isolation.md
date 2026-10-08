# Issue 02: App-Scoped Log Directory Isolation

- **Category**: core-logging
- **Status**: Open
- **Spec Reference**: `../spec-app-scoped-logging.md`

## Summary
모노레포 루트 `logs/` 디렉터리에 모든 서비스의 로그가 섞여 들어가지 않고, 각 애플리케이션(`apps/bot/logs`, `apps/be/logs`)의 자체 디렉터리로 완전히 격리되어 저장되도록 `getLogDir` 및 `createLogger`를 개선합니다.

## Requirements
1. `getLogDir(serviceName, options)`:
   - `options.appDir`가 전달되면 해당 디렉터리 하위의 `logs` 사용.
   - 전달되지 않은 경우, `serviceName` 접두사 분석:
     - `BOT`, `FEEDBACK-CMD`, `SCAN-CMD`, `GUILD-CREATE`, `EVENT-LOADER`, `INTERACTION-EVENT`, `READY-EVENT`, `CONFLICT-BUTTON`, `DISCUSSION-HARVESTER` 등 bot 관련 서비스는 `apps/bot/logs/`에 기록.
     - `BE`, `AI-ADAPTER`, `DECISION-CONTROLLER`, `ERROR-HANDLER`, `BE-EXTRACTOR-CORE`, `AI-EXTRACTOR`, `EXPRESS-LOADER`, `BE-DECISION-SERVICE`, `BE-DISCUSSION-SERVICE`, `BE-FEEDBACK-SERVICE` 등 백엔드 서비스는 `apps/be/logs/`에 기록.
     - 테스트/공통 서비스(`SHARED`, `TEST` 등)는 루트 `logs/` 또는 기본 경로 사용.
2. 파일 트랜스포트 분리:
   - 봇 디렉터리(`apps/bot/logs/`): `bot.log`, `error.log`
   - 백엔드 디렉터리(`apps/be/logs/`): `be.log`, `preprocessing.log`, `error.log`
3. `.gitignore`에 `apps/*/logs` 및 루트 `logs`가 등록되어 있는지 확인 및 누락 시 추가.
4. 단위 테스트 및 통합 테스트 작성: `packages/shared/src/logger.test.ts`에서 각 서비스명에 따라 올바른 앱 디렉터리에 로그 파일이 생성되는지 검증.
