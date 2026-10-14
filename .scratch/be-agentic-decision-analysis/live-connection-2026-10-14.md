# 실제 Gemini 연결 시도 — 2026-10-14

- 루트 설정의 Gemini 키로 모델 정보 조회 HTTP 200. 키 값은 출력/저장하지 않았다.
- `gemini-2.5-flash` 생성 요청 HTTP 404: 공급자가 신규 사용자에게 더 이상 제공하지 않는다며 `gemini-3.8-flash`를 안내했다.
- `gemini-3.8-flash` 생성 요청 HTTP 402 RESOURCE_EXHAUSTED: 프로젝트의 prepayment credits 소진.
- smoke runner는 매 실행 max-calls=2, max-tokens=100000, max-output-tokens=8192, max-input-chars=100000으로 제한했다. 생성 단계에서 거절되어 graph/critic 성공 보고서는 생성되지 않았다. 성공한 생성 응답은 없다.
- 운영 DB는 사용하지 않았다. BE build와 git diff --check는 통과했다. 포맷 수정은 사용자 범위 변경에 따라 하지 않았다.

## 다음 실행 조건

AI Studio에서 프로젝트 billing/credits를 복구한 뒤 사용 가능한 모델로 smoke를 재실행한다. 실제 모델 품질 평가는 여전히 미실행이다.

## 별도 Bot 경고

Sync Job worker / Queue status synchronization 경고는 BOT_SERVICE_TOKEN 미설정 때문이다. 루트/BE/Bot .env에서 설정 부재를 확인했다. DISCORD_BOT_TOKEN은 Discord 로그인용이며 대체할 수 없다. BE와 Bot에 동일한 별도 서비스 토큰을 설정한 뒤 재시작해야 한다.

## 사용자 설정 변경 후 재시도

- 루트와 BE의 Gemini 키가 이제 서로 다르다. 재시도는 루트 설정을 사용했다. BE 실행 설정은 아직 일치하지 않는다.
- 새 루트 키의 gemini-3.8-flash smoke는 45초 제한 안에 완료되지 않아 `AI provider temporarily unavailable`로 실패했다. 이번 실행에서 HTTP 402는 관찰되지 않았지만 결제 복구나 생성 성공이 확인된 것은 아니다.
- 새 루트 키의 gemini-2.5-flash는 다시 HTTP 404와 신규 사용자 모델 접근 제한을 반환했다.
- 성공 보고서는 아직 생성되지 않았다. BOT_SERVICE_TOKEN은 여전히 설정되지 않았다.

## 추가 API 설정 변경 후 검증

- 현재 BE .env를 읽는 gemini-3.8-flash smoke는 HTTP 402 선불 크레딧 오류를 반환했다.
- 현재 루트 .env를 읽는 graph smoke는 HTTP 400 INVALID_ARGUMENT를 반환했다. 루트/BE 키는 서로 다르다.
- 루트 키의 기본 생성(`Reply with OK.`, maxOutputTokens=256, thinkingLevel=LOW) 1회는 HTTP 200, finishReason=STOP, 응답 `OK.`, totalTokenCount=6으로 성공했다.
- 따라서 루트 키의 기본 생성 연결은 확인됐지만 production graph/critic 요청 검증은 아직 실패 상태다. 그래프 요청의 형식/스키마와 현재 모델의 호환성을 좁혀야 한다. 기본 생성 성공을 전체 분석 smoke 성공으로 간주하지 않는다.
