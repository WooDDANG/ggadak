# 04: Gemini에 분석 응답 계약을 전달하기

**What to build:** Gemini가 앱의 분석 응답 구조를 따르도록 요청하고, 받은 결과를 검증해 Review Queue용 Decision Candidate로 저장한다.

**Blocked by:** None (can start immediately).

**Status:** needs-triage

- [ ] JSON MIME type뿐 아니라 공통 분석 응답 계약에서 도출한 공급자 지원 출력 schema를 요청에 전달한다.
- [ ] Gemini에서 지원하는 schema 제약을 확인하고 별도 수동 복제 계약 없이 앱과 공급자 schema의 필드·enum 일치를 검증한다.
- [ ] 실제 Gemini 요청 빌더·응답 파서와 분석 API·임시 DB를 연결해 정상 후보와 no-decision 동작을 검증한다.
- [ ] 응답 종료 사유와 콘텐츠 유무를 검사하여 차단·잘림·불완전 출력이 정상 분석 완료로 저장되지 않게 한다.
- [ ] 공급자 schema만으로 의미적 정확성이 보장된다고 가정하지 않고 Service의 의미 검증을 유지한다.
- [ ] 모델 선택은 설정 가능하게 유지하며 일반 회귀 테스트는 주입한 HTTP 응답만 사용한다. FE는 변경하지 않는다.
