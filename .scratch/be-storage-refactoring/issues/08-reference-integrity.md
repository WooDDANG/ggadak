# 08: 결정·분석 이력의 참조 무결성 보장

**What to build:** 후보·분석·편집 이력이 존재하지 않는 데이터를 참조하지 않게 하고, 결정 변경이나 삭제가 검수·분석 증거를 훼손하지 않게 한다.

**Blocked by:** 03 — External Feedback의 채널 중심 저장 계약 정리; 07 — 후보 이력 관계 조회와 그래프 버전 조회 개선.

**Status:** resolved

- [x] CandidateIdentity·CandidateAnalysis·DecisionEdit와 새 후보 연결 관계 등 실제 참조의 대상과 수명을 명시하고 Prisma/DB 제약으로 보장한다.
- [x] 피드백의 채널 ID를 Decision 외래키로 취급하지 않는다. Discord 식별자라는 이유만으로 로컬 Guild/User 행의 존재를 요구하지 않는다.
- [x] 도입 전 참조 누락을 검출한다. 기존 의미 있는 이력을 지워 제약을 맞추지 않고 보존·복구 방식을 제공한다.
- [x] 삭제 정책은 검수 이력과 분석 증거의 보존을 우선하고, 필요한 항목만 연쇄 처리한다.
- [x] 잘못된 참조 생성이 거절되고 정상 분석 완료·편집·검수·중복 방지·백업 이관이 통과하는 격리 DB 검증이 있다.

## Answer

CandidateIdentity/CandidateAnalysis/DecisionEdit/CandidateRelation에 restrictive FK를 추가했다. migration 마지막 foreign_key_check와 orphan 생성 거절을 검증했다. 피드백은 채널 중심으로 유지한다.

검증과 제한: [구현 검증 기록](../implementation-verification.md).
