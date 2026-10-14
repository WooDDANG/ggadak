# 01: OpenAI 공급자 경로를 독립적으로 검증 가능하게 만들기

**What to build:** 외부 AI를 호출하지 않고 실제 OpenAI SDK 경로를 통해 받은 Decision Candidate가 분석 API에서 저장·조회되는 것을 검증한다.

**Blocked by:** None (can start immediately).

**Status:** needs-triage

- [ ] OpenAI와 Gemini의 공급자 호출을 인스턴스별로 주입할 수 있으며 전역 fetch를 바꾸지 않고 각각 독립적으로 검증한다.
- [ ] 정상 OpenAI SDK 응답이 요청 검증·Discussion Context 처리·Decision Candidate 저장·조회까지 연결되는 공개 경계 테스트가 통과한다.
- [ ] 요청 모델, 인증 헤더, 시스템 지침과 Discussion Context가 공급자 요청에 포함되며 테스트 로그에 키가 노출되지 않는다.
- [ ] 현재 설치 SDK의 주입 가능성을 확인하고 SDK 변경이 필요하면 필요한 범위만 변경한다. 기존 Gemini 경로와 API 계약을 보존한다.
- [ ] 일반 테스트 명령은 외부 AI를 호출하지 않고 격리 DB를 사용한다. FE 변경과 운영 DB 변경은 없다.
