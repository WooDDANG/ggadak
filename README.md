# GGADDAK (까딱) - AI 기반 디스코드 의사결정 추적 및 거버넌스 플랫폼

> 디스코드 채널의 흩어지는 대화를 LLM으로 실시간 분석하여 공식 의사결정(Decision Record)과 근거(Rationale)를 추출하고, 웹 대시보드와 OpenAPI로 체계화하는 전주기 거버넌스 모노레포 시스템입니다.

---

## 1. 프로젝트 소개

GGADDAK은 디스코드(Discord) 협업 채널에서 휘발되기 쉬운 중요한 합의 사항을 자동으로 추적하고 기록하기 위해 제작된 풀스택 플랫폼입니다.

봇 데몬이 채널 대화 맥락(Discussion Context)을 감지하면 AI 엔진이 다중 의사결정과 액션 아이템, 거버넌스 점수를 추출합니다. 추출된 후보는 백엔드의 검토 대기열(Review Queue)을 거쳐 최종 의사결정(Decision Record)으로 승인되며, 프론트엔드 타임라인과 Swagger(OpenAPI v3) 명세를 통해 팀 전체에 투명하게 공유됩니다.

---

## 2. 주요 기능

- **디스코드 실시간 모니터링 및 트리거 감지**: 특정 이모지(📌) 반응이나 합의성 발언 패턴을 포착하여 비동기 대화 수집(Harvesting Window) 실행
- **LLM 다중 의사결정 자동 추출**: Vercel AI SDK 기반으로 대화 맥락 속에서 결정 내용(Decision), 채택 이유(Rationale), 후속 과제(Action Items)를 구조화된 JSON으로 추출
- **거버넌스 점수(Governance Score) 산출**: 합의 강도, 참여자 다양성, 근거 밀도를 평가하여 1.0 ~ 4.0 척도의 신뢰도 부여
- **검토 대기열(Review Queue) 승인 파이프라인**: AI가 추출한 후보(Decision Candidate)를 팀 리더가 확인/수정/반려할 수 있는 안전 장치 제공
- **의사결정 타임라인 및 피드백 대시보드**: 승인된 결정을 토픽/채널별로 시각화하고 외부 피드백과의 연계를 지원하는 React 웹 앱
- **TSOA 기반 OpenAPI v3 명세 및 Swagger UI**: 백엔드 컨트롤러 기반의 Code-first API 자동 명세화 (`/api-docs`)

---

## 3. 사용 기술

### Backend (`apps/be`)
- **Runtime & Framework**: Node.js v22, Express v5
- **API Spec & Docs**: TSOA v7 (OpenAPI v3 Code-first), Swagger UI Express v5
- **ORM & Database**: Prisma v5, SQLite
- **AI Integration**: Vercel AI SDK v3, @ai-sdk/google, @ai-sdk/openai
- **Architecture**: TypeDI (Dependency Injection), Winston Logger, Zod

### Bot Daemon (`apps/bot`)
- **Runtime**: Node.js v22, TypeScript v5
- **Discord Client**: Discord.js v14
- **Reliability**: SQLite 기반 Egress Queue (장애 복구 전송 큐)

### Frontend (`apps/fe`)
- **Core**: React v18, Vite v5, TypeScript v5
- **State & Server Cache**: TanStack React Query v5
- **Styling & UI**: Tailwind CSS v3, Lucide React

### Shared Package (`packages/shared`)
- 도메인 검증 스키마(Zod), 공통 TypeScript 인터페이스, 시맨틱 거버넌스 스코어러, 통합 Winston 로거

---

## 4. 실행 환경

- **Node.js**: v20.0.0 이상 권장 (v22 환경 테스트 완료)
- **패키지 매니저**: npm (npm workspaces 모노레포)
- **운영체제**: macOS / Linux / Windows
- **필수 외부 서비스**: Discord Developer Portal (Bot Token 생성) 및 LLM API Key (OpenAI 또는 Google Gemini, Mock 모드 지원)

---

## 5. 설치 및 실행 방법

### 1) 저장소 클론 및 패키지 설치
```bash
git clone <repository-url>
cd GGADDAK
npm install
```

### 2) 환경 변수 설정
루트 디렉터리의 `.env.example`을 복사하여 `.env`를 생성하고 필요한 키를 입력합니다.
```bash
cp .env.example .env
```

주요 환경 변수:
```env
DISCORD_BOT_TOKEN=your_discord_bot_token_here
TRIGGER_EMOJI=📌
BE_PORT=3001
BE_DATABASE_PATH=./decisions.sqlite
BE_WEBHOOK_URL=http://localhost:3001/api/webhooks/decisions
FE_PORT=3000
AI_PROVIDER=mock # mock, openai, google
```

### 3) 데이터베이스 마이그레이션 및 API 명세 빌드
```bash
# 백엔드 Swagger 및 TSOA 라우트 생성
npm run swagger --workspace=@ggaddak/be

# Prisma 마이그레이션 (필요 시)
npx prisma generate --schema=apps/be/prisma/schema.prisma
```

### 4) 전체 프로젝트 빌드 및 실행
```bash
# 전체 빌드
npm run build

# 개별 서비스 실행 (별도 터미널 권장)
npm run dev:be   # 백엔드 API 서버 (포트 3001, Swagger: http://localhost:3001/api-docs)
npm run dev:fe   # 프론트엔드 대시보드 (포트 3000: http://localhost:3000)
npm run dev:bot  # 디스코드 봇 데몬
```

---

## 6. 조작 및 거버넌스 워크플로우

1. **디스코드 토론**: 팀 채널에서 안건에 대한 토의가 진행됩니다.
2. **트리거 발생**: 핵심 결론 메시지에 `📌` 반응을 남기거나 `~하기로 결정했습니다`와 같은 합의 키워드가 감지됩니다.
3. **AI 맥락 수집 및 분석**: 봇이 전후 대화 맥락을 수집해 백엔드로 전달하고, AI가 의사결정 후보(Candidate)를 추출합니다.
4. **리뷰 대기열 승인**: 웹 대시보드의 Review Queue에서 팀 리더가 추출된 내용을 확인하고 최종 `Decided` 상태로 승인합니다.
5. **타임라인 확인**: 모든 팀원이 Decision Timeline에서 최신 의사결정과 히스토리를 열람합니다.
6. **API 명세 조회**: 브라우저에서 `http://localhost:3001/api-docs`로 접속하여 전체 엔드포인트를 실시간 테스트합니다.

---

## 7. 프로젝트 구조

```text
GGADDAK/
├── apps/
│   ├── be/                # 백엔드 REST API 서버 & AI 분석 파이프라인
│   │   ├── src/
│   │   │   ├── api/       # TSOA Controller, 라우트, 미들웨어, Swagger 문서
│   │   │   ├── services/  # 의사결정 수명주기, AI 추출 서비스
│   │   │   └── loaders/   # Express, DI(TypeDI), 로거 초기화
│   │   └── tsoa.json      # TSOA OpenAPI v3 설정 파일
│   ├── bot/               # 디스코드 이벤트 수집 및 Egress 전송 데몬
│   │   └── src/
│   │       ├── handlers/  # 메시지 및 이모지 반응 핸들러
│   │       └── queue/     # SQLite 기반 전송 보장 Egress Queue
│   └── fe/                # React 웹 대시보드
│       └── src/
│           ├── api/       # 백엔드 연동 클라이언트 (Codegen 연동 대상)
│           ├── features/  # 타임라인, Review Queue, 피드백 보드
│           └── components/# 재사용 UI 컴포넌트
├── packages/
│   └── shared/            # 공통 Zod 도메인 스키마, 타입, 시맨틱 평가기, 로거
├── docs/                  # 아키텍처 의사결정 기록(ADR) 및 에이전트 가이드
├── CONTEXT.md             # 전역 도메인 모델 용어 사전 (SSOT)
├── CONTEXT-MAP.md         # 서비스 간 컨텍스트 맵
└── package.json           # 루트 모노레포 워크스페이스 설정
```

---

## 8. 아키텍처 및 구현 의도 (학습 포인트)

- **도메인 모델 단일 진실 공급원(SSOT)**:
  - `Decision`, `Rationale`, `Review Queue`, `Governance Score` 등 전역 용어를 [`CONTEXT.md`](file:///Users/wooddang-mac/Desktop/code/5.%20toy/GGADDAK/CONTEXT.md)로 규정하여 코드와 문서의 용어 불일치를 방지했습니다.
- **TSOA Code-first 기반 OpenAPI 자동화**:
  - 수동 Swagger 작성의 불일치 문제를 해결하기 위해 백엔드 TypeScript Controller와 DTO를 기반으로 빌드 시 OpenAPI v3 명세(`swagger.json`)가 100% 자동 생성되도록 구성했습니다.
- **비차단 비동기 봇 아키텍처**:
  - 디스코드 3초 게이트웨이 타임아웃을 방지하기 위해 상호작용 처리를 즉시 지연(defer)하고 SQLite 기반 Egress Queue로 유실 없는 네트워크 전송을 보장했습니다.
- **단일 책임 모노레포 구조**:
  - Bot, BE, FE가 도메인 계약(`packages/shared`)을 참조하도록 결합도를 낮추고 독립 배포가 가능하도록 설계했습니다.

---

## 9. 현재 상태 및 향후 로드맵

### 현재 상태
- [x] 디스코드 봇 대화 감지 및 Egress 큐 기반 백엔드 연동 완료
- [x] 백엔드 Vercel AI SDK 다중 결정 추출 및 거버넌스 스코어러 구현 완료
- [x] Prisma SQLite 기반 의사결정/피드백 CRUD 영속화 완료
- [x] TSOA 기반 Swagger UI (`/api-docs`) 서빙 파이프라인 구축 완료
- [x] **FE API 클라이언트 자동 생성 (Orval Codegen)**: BE `swagger.json` 기반 React Query v5 훅 및 모델 자동 생성 연동 완료 (`apps/fe/src/api/generated/`)
- [x] **모노레포 API 동기화 체인 구축**: `npm run api:sync` 단일 명령어로 BE 명세 추출 및 FE 클라이언트 자동 생성 체인화 완료
- [x] React 웹 대시보드 데모 화면(타임라인, 대기열) 구성 완료

### 향후 로드맵
- [ ] **FE 웹 대시보드 정식 React 포팅 및 UI 고도화**: 자동 생성된 React Query 훅(`useGetDecisions` 등)을 전면 적용한 신규 대시보드 구현
- [ ] **디스코드 상호작용 충돌 해결 UI**: 기존 결정과의 모순 발생 시 디스코드 버튼 컴포넌트를 통한 대화형 해결 고도화

---

## 10. 라이선스

이 프로젝트는 [MIT License](LICENSE)에 따라 자유롭게 수정 및 배포할 수 있습니다.
