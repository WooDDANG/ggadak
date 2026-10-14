# 05: Rationale 원문 인용의 진위 검증

**What to build:** Decision Candidate에 표시되는 Rationale 인용은 실제 Discussion Context의 작성자와 발화에서 확인되는 내용으로 제한한다.

**Blocked by:** 02: 빈 결정과 모순된 분석 결과의 정상 완료 차단.

**Status:** needs-triage

**Design disposition:** 기존 인용 검증 계획은 [새 평가·인계 결정](../../be-agentic-decision-design/issues/06-evaluation-and-handoff.md)으로 대체되었다. 아래 체크리스트는 역사적 초안이며 그대로 구현하지 않는다. 요약이 기본이고 직접 인용·메시지별 원문 일치는 제출 필수 조건이 아니다. 입력 밖 내용 생성 검증은 새 의미 검증 단계에 반영한다.

- [ ] 인용의 작성자와 텍스트를 원본 메시지와 대조한다. AI가 만들어 낸 발화·잘못된 작성자·의역을 verbatim 인용으로 저장하지 않는다.
- [ ] 부분 인용, 공백·줄바꿈 및 Unicode 정규화의 허용 범위를 명시하고 한국어·영어 사례를 검증한다.
- [ ] 유효한 인용은 그대로 저장·조회되며 존재하지 않는 인용은 잘못된 분석 결과로 판정해 후보·요청 완료를 원자적으로 보류한다.
- [ ] burst merging과 reply 처리 뒤에도 원본 메시지 ID·작성자·텍스트를 대조하고 인용 검증에 전처리로 만든 문자열을 원문처럼 사용하지 않는다.
- [ ] 인용 없는 유효한 Decision Candidate와 실제 Rationale이 없는 대화의 처리를 구분해 불필요한 근거를 생성하지 않는다.
- [ ] 공개 분석 API·DB 재조회 경계에서 동작을 검증하며 FE 표시 계약은 유지한다.
