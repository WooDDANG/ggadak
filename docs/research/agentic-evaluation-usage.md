# Agentic 평가 도구 사용

이번 작업에서는 유료 AI 호출을 하지 않았다. 오프라인 도구 통과는 실제 공급자 연결·모델 품질 검증을 뜻하지 않는다.

## 정답 준비

AMI는 [준비 문서](ami-evaluation-preparation.md)를 따른다. 공식 dev/test 20개씩을 유지한다.

```bash
python3 -B scripts/evaluation/evaluation_gold.py prepare --input .data/evaluation/ami/prepared/dev.jsonl --output .data/evaluation/ami/gold-dev.jsonl
python3 -B scripts/evaluation/evaluation_gold.py prepare --input .data/evaluation/ami/prepared/test.jsonl --output .data/evaluation/ami/gold-test.jsonl
python3 -B scripts/evaluation/evaluation_gold.py validate --input .data/evaluation/ami/gold-test.jsonl
```

`--kind service`는 추가 주석 초안이다. 사람이 gold.candidates/nodeIds/relations를 채우고 reviewed/revision/complete를 기록한다. originalGold는 보존한다. AMI 원래 요약은 사람이 작성했지만 서비스 후보·그래프 전체 정답은 아니다. 한국어 gold는 아직 확보·완전 주석되지 않았다.

validate는 중복 ID·관계 끝점·동일 회의/팀 분할 누출·검수 버전 누락을 거절한다. test gold를 모델 출력에 맞춰 바꾸지 않는다.

## 오프라인 runner

저장소 루트에서 실행한다. 임시 SQLite만 사용하고 운영 DB를 수정하지 않는다.

```bash
npm run build --workspace=@ggaddak/be
node apps/be/dist/evaluation/runner.js --input .data/evaluation/ami/gold-dev.jsonl --fixtures .data/evaluation/fixtures.json --output .data/evaluation/offline-run.json --limit 1
```

fixture는 meetingId별 baseline/extract/verify/repair 배열이다. 각 배열은 단계 순서의 고정 응답이며 사용하지 않는 repair는 빈 배열이다. baseline은 found/summary/decisions, extract/repair는 graph, verify는 valid/issues다. 부족한 응답도 실패로 보고한다.

모델 입력은 input.utterances만 사용한다. AMI 상대 시각은 분할을 위해 고정 기준일로 변환하며 실제 날짜로 해석하지 않는다. reply 관계를 만들어 넣지 않는다. baseline과 workflow는 동일 전처리·세션을 사용한다.

## 실제 연결·평가

fixture 없는 기본 실행은 중단한다. 유료 호출에는 --live, 실제 provider/model과 명시적인 모든 예산이 필요하다. 다음 수치는 예시이며 권장 최적값이 아니다.

```bash
node apps/be/dist/evaluation/runner.js --live --smoke --provider gemini --model YOUR_MODEL --max-calls 2 --max-tokens 100000 --max-output-tokens 8192 --max-input-chars 100000 --output .data/evaluation/live-smoke.json
node apps/be/dist/evaluation/runner.js --live --provider gemini --model YOUR_MODEL --max-calls 10 --max-tokens 200000 --max-output-tokens 8192 --max-input-chars 100000 --input .data/evaluation/ami/gold-dev.jsonl --limit 1 --output .data/evaluation/live-run.json
```

OpenAI는 provider=openai와 계정의 모델을 지정한다. credentials는 환경 설정을 사용하고 manifest에 저장하지 않는다. 공급자 HTTP transport로 시도·취소·예산을 제어해 SDK 숨은 retry를 피한다. 호출 전에 요청 bytes+출력 한도로 보수적으로 예약하고 실제 total usage로 정산한다. usage 누락·통신 실패는 예약 소비를 유지한다.

smoke는 실제 통신·graph/critic 형식을 확인하지만 품질 평가는 아니다. 모델·prompt/schema·baseline 버전·입력 checksum·예산·사용량을 manifest에 남긴다. 기존 단일 호출은 평가 baseline으로만 보존하고 production fallback은 없다.

## 의미 대응과 점수

gold validate가 출력한 goldDigest로 별도 judgments JSON을 작성한다. 최상위 reviewed=true/revision과 meetingId별 baseline/workflow 판단이 필요하다. 각 방법에 candidateMatches(예측 ID·gold ID 쌍), nodeMatches(다른 노드 쌍), relationMatches(관계 ID 쌍), falseClaims/structureErrors의 인간 판정을 기록한다. 미확인 오류 수는 null이다.

```bash
python3 -B scripts/evaluation/evaluation_gold.py score --gold .data/evaluation/ami/gold-test.jsonl --run .data/evaluation/live-run.json --judgements .data/evaluation/judgments.json --output .data/evaluation/score.json
```

run/gold는 같은 회의 집합을 사용한다. 후보 대응은 의미적 일대일, 관계는 대응 끝점·종류·방향을 검사하며 충돌의 대칭만 정규화한다. AMI 전체 후보 precision/graph 지표는 N/A이고 결정 요약 recall을 서비스 전체 recall로 읽지 않는다. 완전 주석 서비스 gold에서만 후보/관계 90%·오류 0건 목표를 판정한다. 빈 분모는 null이다. 실패와 usage를 숨기지 않고 데이터 종류·언어·방법별로 구분한다.
