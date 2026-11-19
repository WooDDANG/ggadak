# BE Context

The backend REST API server managing persistent decision storage, Review Queue lifecycle, AI extraction engine, and external feedback ingestion.

## Language

**Bot Installation Status**:
Whether the GGADDAK bot is installed in a selected Discord server: installed,
not installed, or unknown when the available evidence cannot establish either.
Channel access permissions are a separate concern.
_Avoid_: Bot Online Status, Channel Accessibility

**Analysis Queue**:
The durable collection of received Discussion Contexts awaiting analysis, execution, or bounded retry. A received Scan Range becomes eligible only after the channel's declared scan coverage is fully received; receipt itself is distinct from completed analysis.

**Analysis Request**:
A persisted request to analyze one received Discussion Context, tracked through retries to a final outcome.
_Avoid_: AI Call, Analysis Attempt

**손상된 분석 세션**:
유효하지 않은 관계가 제거돼 일부 관계 정보가 온전하지 않은 분석 세션이다. 구조 검증과 Verify를 통과한 후보에는 손상 경고가 함께 표시된다.

**분석 실패로 건너뜀**:
분석을 완료하지 못한 세션을 실패로 기록하면서 동기화는 계속 진행한 상태다. 정상 분석에서 결정이 없다고 확인된 상태와 구분한다.

**출력 형식 실패**:
AI가 약속된 형식의 응답을 내지 못한 실패다. 빈 응답, 해석할 수 없는 응답, 출력 상한에서 잘린 응답, 형식을 어긴 Verify 응답을 포함한다. 그래프 내용이 잘못된 구조 검증 실패나 의미 검증 실패와 구분한다.
_Avoid_: 구조 검증 실패, 파싱 오류

**AI Call**:
One invocation of an AI provider during an Analysis Request. A request can contain multiple AI Calls, and an individual call's result does not determine the request's final outcome.
_Avoid_: Analysis Request

**Durable Receipt**:
The backend's confirmation that both an input and its processing intent have been persisted. It transfers analysis responsibility from the Bot to the BE without claiming that analysis succeeded.

**Review Queue**:
The staging pipeline and query interface where Decision Candidates are held in Draft state until human leads confirm, edit, or reject them.
_Avoid_: Inbox, Approval List, Staging Area, Pending Tasks

**Decision Ingestion**:
The endpoint and pipeline responsible for authenticating and validating incoming Decision Payloads from the Bot daemon.
_Avoid_: Webhook Receiver, Bot Handler

**Decision Record**:
The persisted database entity representing a verified organizational Decision, its Rationale, and historical revisions.
_Avoid_: Note, Ticket, Document, Row

**Evidence Hash**:
A deterministic cryptographic hash generated from raw discussion messages to prevent duplicate extraction of previously rejected candidates.
_Avoid_: Anti-Duplicate Key, Message Fingerprint, Signature

**Governance Score**:
A 4-tier rubric score (1.0 to 4.0) measuring the consensus strength, participant diversity, and evidence density of a Decision Candidate.
_Avoid_: Quality Rating, Confidence Level, Priority Score
