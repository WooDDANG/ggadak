# 의사결정 기능 현황 — 2026-10-15

정식 기능 문서와 Mermaid 다이어그램: [의사결정 기능과 AI 분석 흐름](../docs/decision-features.md). 아래는 기준일 점검 원본이다.

구현 코드·기능별 완료 티켓과 최신 실제 AI 검증 기록을 대조했다. 신규 코드 구현이나 운영 환경 변경을 수행한 기록은 아니다.

| 영역 | 구현 기능 |
| --- | --- |
| Discord 수집 | 모니터링 채널 설정, 메시지/사용자 반응/수동 요청 기반 수집, 앞뒤 대화·답글·반응 보존, 채널별 debounce·직렬화 |
| 과거 대화 동기화 | 수동/전체 동기화, 진행률·성공/실패 상태, checkpoint와 재시작 복구. Bot 시작/초대 자동 전수 스캔은 제거됨 |
| 분석 전처리 | 노이즈 필터, 짧은 동의 발화·반응 처리, 얽힌 대화와 시간 공백·주제 변화에 따른 세션 분리 |
| AI 분석 | agy 기반 추출→구조 검사→의미 검증→한 번 수정·재검증. 합의/미합의/철회, 대안, 근거, 액션·담당자·기한을 입력에 맞춰 보존 |
| 논리 그래프 | Topic/Issue/DecisionCandidate/Alternative/Rationale/ActionItem 노드와 지지·반대·대안·의존 관계. 분석/graph API와 snapshot 저장; 전용 그래프 시각화 화면까지 구현한 것은 아님 |
| 모델 선택 | 기본 모델 및 추출/검증/수정 역할별 모델 설정. 시작 시 설정 snapshot과 재시작 보존. 복잡도 기반 자동 선택은 없음 |
| 검수 | Review Queue 확정·보류·폐기, 검수자·확정 시각 저장, 오래된 버전/중복 처리 거절. 사람만 최종 확정 |
| 교체·이관 | 기존 Decision Record의 원자적 Supersede, 미완료 Action Item 취소·이전, 완료 이력 보존, 독립 확정 |
| 편집·이력 | 결정 카드/근거/대안/Action Item 편집, 변경 이력, 버전 충돌 검사, AI snapshot과 현재 인간 편집 결과 구별 |
| 재분석·복구 | Evidence Hash 및 후보 중복 억제, 폐기 근거 자동 재생성 차단, 명시적 수동 재분석, 실패 보존·재시도, 채널 checkpoint 빈 구간 방지 |
| 조회·타임라인 | 서버별 목록·상세·필터·페이지, 확정 결정의 월/주제/채널/카테고리 타임라인, 시간대·기간 처리, 원문 대화 접기/펼치기 |
| Why 검색 | 자연어 임베딩 검색, 관련 결정·근거 발췌·Discord 출처, 저장 색인·갱신·실패 복구. 분석 CLI와 별도인 OpenAI 임베딩 설정 사용 |
| 요약·피드백 | 결정/보류/검수 대기 지표, 최근 결정·동기화 상태, 외부 피드백 입력·조회. 입력 밖 과거 결정과의 AI 자동 충돌 판단은 추가하지 않음 |
| 접근·저장 | Discord 로그인·주요 v1 API의 guild 권한 검사, SQLite/Prisma 영속성, additive migration, OpenAPI·FE 생성 클라이언트 |

## 실제로 검증한 범위

전체 테스트(BE 108/E2E 6 포함), typecheck, review가 통과했다. 실제 agy 한국어 합성 샘플에서 분석·임시 DB 저장/조회를 확인했고, 서로 다른 모델(Low 추출/Medium 검증)도 성공했다. 기존 default는 모든 단계 gemini-3.8-flash-low이며 역할 override는 현재 root 설정에 없다.

## 운영 검증 전에 남은 사항

- 읽기 전용으로 확인한 현재 DB는 202610140001_agentic_analysis migration 미적용 상태다. 검증 환경과 데이터 보존 방식을 결정한 뒤 적용해야 한다.
- root에 BOT_SERVICE_TOKEN, Discord 웹 로그인 OAuth 설정이 없고 MonitoredChannel은 0건이다.
- 실제 Discord 수집→웹 검수→사람 확정의 연결 검증은 아직 완료하지 않았다.
- 대표 한국어 대화 gold 50개와 90% 품질 목표는 아직 검증하지 않았다. 샘플 성공을 정확도 보장으로 해석하지 않는다.
- 요청 전체에 걸친 실제 CLI 호출·누적 토큰/시간 예산은 다음 설계 과제다. 세션별 시간 제한과 논리 단계 guard는 이미 있다.

근거: [v1 티켓](v1-api-model-renewal/issues/), [agentic 분석 티켓](be-agentic-decision-analysis/issues/), [CLI 검증](../docs/research/agy-cli-integration.md), [Timeline 계약](../docs/model/decision-timeline.md), [다음 단계 인터뷰](ai-agent-next-steps/map.md).
