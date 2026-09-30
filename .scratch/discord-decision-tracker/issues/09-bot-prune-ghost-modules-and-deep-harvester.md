# 09 — 봇 레거시 유령 모듈 제거 및 단일 심층 DiscussionHarvester 통합

**What to build:**
과거 단일 스크립트 시절의 잔재인 4개 유령 모듈(로컬 추출기, 컨텍스트 빌더, 충돌 감지기, 로컬 이그레스 큐) 및 더미 단위 테스트를 완전히 삭제합니다. 채널 수확, 디바운스, 중복 방지 락, 백엔드 통신, 임베드 렌더링, 체크포인트 저장을 단일 심층 모듈(`DiscussionHarvester`) 뒤로 캡슐화하여, 봇의 모든 이벤트 핸들러와 슬래시 커맨드가 단일 인터페이스를 통해 일관되게 대화를 수확하고 처리하도록 만듭니다.

**Blocked by:** None — can start immediately

**Status:** ready-for-agent

- [x] `apps/bot`에서 실제 런타임에서 쓰이지 않는 4개 레거시 모듈 디렉토리(`extractor/`, `context/`, `conflict/`, `egress/`) 삭제
- [x] `HarvesterService`와 `AnalysisService`를 응집도 높은 `DiscussionHarvester` 심층 모듈로 통합 및 인터페이스 단순화
- [x] `MessageHandler`, `ReactionHandler`, `ScanCommand`, `ready.event`, `guildCreate.event`가 통합된 심층 모듈을 단일 진입점으로 호출하도록 리팩터링
- [x] `bot.test.ts`를 유령 모듈 더미 테스트 대신 실제 메시지 윈도우 수확 및 통합 파이프라인 중심 단위 테스트로 교체
