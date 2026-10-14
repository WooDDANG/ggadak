# 대화 기반 의사결정 추출 평가 데이터셋 조사

조사일: 2026-10-14. 공식 배포처·저자 저장소·원 논문의 공개 정보를 확인했다. 전체 데이터셋 다운로드와 유료 AI 실행은 하지 않았다.

후속 작업: AMI 공식 ZIP 다운로드와 142개 회의의 로컬 변환을 완료했다. 실제 파일 확인으로 논증 주석 존재 여부도 보완했다. 자세한 결과와 사용 방법은 [AMI 평가 자료 준비 결과](ami-evaluation-preparation.md)를 참조한다. 다른 데이터 다운로드와 실제 AI 평가는 아직 하지 않았다.

## 결론

다운로드 가능한 데이터는 있다. **첫 선택은 AMI의 수동 전사·결정 요약·발화 연결 주석**이다. 결정, 문제, 후속 행동을 따로 요약하므로 일반 회의 요약보다 우리 서비스에 가깝다. 다만 **미합의 제안·철회·대안별 관측 결과·찬반 및 의존 관계를 모두 평가하는 완성된 우리 도메인의 정답 그래프는 확인하지 못했다**. 기존 주석을 기반 평가에 쓰고, 한국어 입력 대화에 우리 계약으로 추가 정답을 만드는 조합을 권한다. 아래 추천은 조사 결과에 따른 설계 제안이다. [AMI 주석 설명](https://groups.inf.ed.ac.uk/ami/corpus/annotation.shtml)

## 데이터 비교

| 데이터                               | 언어·규모                                     | 실제 제공 정답                                                                     | 다운로드·조건                                                  | 우리 용도와 한계                                                                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AMI**                              | 영어 회의 약 100시간                          | 결정·문제·행동의 사람 작성 요약, 요약 문장과 발화 연결; 일부 회의에 decision point | 공식 수동 주석 ZIP 22MB, CC BY 4.0                             | 결정 추출 기반 평가 1순위. 미합의 제안 전체와 우리 논리 그래프 정답은 아님. [공식 소개](https://groups.inf.ed.ac.uk/ami/corpus/), [다운로드](https://groups.inf.ed.ac.uk/ami/download/), [보유 주석 표](https://groups.inf.ed.ac.uk/ami/corpus/annotationpresent.shtml) |
| **QMSum**                            | 영어 회의 232개, 질의·요약 1,808쌍            | 주제, 질문, 답변 요약, 관련 발화 구간                                              | 공개 GitHub JSON/JSONL, train/val/test; 저장소 MIT             | 대화에 충실한 요약·맥락 검사 보조. 결정 후보 전수 라벨은 아님. [저자 저장소](https://github.com/Yale-LILY/QMSum)                                                                                                                                                        |
| **ICSI**                             | 영어 회의 약 70시간                           | 전사·발화행위; contributed ZIP에 주제·요약 등                                      | 공식 core 19MB / contributed 53MB, 전사 및 일부 주석 CC BY 4.0 | 실제 회의로 도메인 확장. 공식 다운로드 설명에서 결정 전용 별도 정답 묶음은 확인하지 못함. [소개](https://groups.inf.ed.ac.uk/ami/icsi/), [다운로드](https://groups.inf.ed.ac.uk/ami/icsi/download/)                                                                     |
| **AI Hub 요약문 및 레포트 생성**     | 한국어; 공식 분할 표의 회의록 34,000건        | 원문·생성 요약·추출 요약                                                           | 데이터 신청·승인 후 다운로드/API; 내국인 신청 안내             | 한국어 추가 주석의 원문 후보. 결정·합의·그래프 라벨은 아님. [공식 데이터](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=582)                                                                                                                                     |
| **AI Hub 주요 영역별 회의 음성인식** | 한국어 7,000시간                              | 화자·전사 등 JSON + WAV                                                            | AI Hub 신청 경로; 상세 이용 조건 확인 필요                     | 다자 대화 원문 확보용. 결정 정답 없음. [공식 데이터](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=464)                                                                                                                                                          |
| **MeetingBank**                      | 영어 지방의회 회의 1,366개, 요약 구간 6,892개 | 회의록 기반 구간 요약·안건 유형·전사                                               | 공식 HF 배포; **CC BY-NC-ND 4.0**                              | 공적 결정·장문 시험 보조. 결정 그래프 정답은 아니며 라이선스 때문에 우선순위 낮음. [데이터 설명](https://meetingbank.github.io/dataset/), [배포](https://meetingbank.github.io/), [라이선스](https://meetingbank.github.io/license/)                                    |
| **VCSum**                            | 중국어 회의 239개, 230시간 이상               | 주제 경계·표제·구간/전체 요약·핵심 문장                                            | 공개 GitHub `vcsum_data`, 저장소 MIT                           | 다자 대화 분할 평가 보조. 한국어도 결정 전용 정답도 아님. [저자 저장소](https://github.com/hahahawu/VCSum)                                                                                                                                                              |

저장소 라이선스와 원천 대화의 권리는 구분한다. QMSum·VCSum에는 저장소 MIT가 표시되어 있지만 파생 원천 자료의 개별 조건까지 전부 검증하지 않았다. AI Hub 데이터의 정확한 재배포·외부 AI 전송 허용 범위는 데이터별 약정 확인 전에는 확정하지 않는다. 익명 공개 다운로드와 신청형 다운로드도 구분한다.

## AMI에서 바로 평가할 수 있는 것

AMI 사람 요약의 구성은 `ABSTRACT`, `DECISIONS`, `PROBLEMS/ISSUES`, `ACTIONS`이고, 추출 요약 발화가 요약 문장과 연결된다. 따라서 **결정 요약 하나 ↔ 관련 대화**를 묶어 결정 내용 누락·왜곡, 문제와 결정의 혼동, 후속 행동 생성 여부를 검사할 수 있다. 단어가 같아야 하는 정답은 아니므로 의미 단위 비교가 적합하다. [공식 주석 설명](https://groups.inf.ed.ac.uk/ami/corpus/annotation.shtml)

Decision-discussion 지침은 결정 요약에 등장하는 결정의 대화 구간을 다루며, 외부에서 이미 내려온 결정(`external`)과 재정리(`recap`)도 구분한다. **이것을 미합의 제안까지 빠짐없이 포함한 후보 정답으로 취급하면 안 된다.** 공식 회의별 표에는 decision point 유무가 따로 있으므로 보유 회의만 선별한다. 실제 ZIP 안의 상세 필드·유효 주석 수는 다운로드 후 조사해야 한다. 지침이 있다는 사실만으로 모든 회의에 주석이 있다고 추정하지 않는다. [결정 구간 지침](https://groups.inf.ed.ac.uk/ami/corpus/Guidelines/decision_annotation-boundary-v1.4.pdf), [주석 보유 표](https://groups.inf.ed.ac.uk/ami/corpus/annotationpresent.shtml)

AMI의 argumentation/TAS 지침은 발견했지만 웹 설명은 시험적 주석이 일반 공개되지 않았다고 명시한다. 후속 실제 ZIP 확인에서는 `argumentation/ae`, `ar`, `dis`와 관계 ontology가 존재했다. 따라서 공개 주석의 존재는 확인되었으나 우리 정답 그래프와의 매핑·완전성은 아직 검증하지 않았다. [공식 주석 설명](https://groups.inf.ed.ac.uk/ami/corpus/annotation.shtml), [실제 ZIP 검사 결과](ami-evaluation-preparation.md)

AMI는 scenario-only / full-corpus / full-corpus-ASR 분할을 제공한다. 공개 성능과 비교하려면 분할 종류와 회의 ID를 고정한다. 서로 이어지는 동일 팀의 회의를 임의로 개발·최종평가에 나누지 않는 방안을 권한다. [공식 분할](https://groups.inf.ed.ac.uk/ami/corpus/datasets.shtml)

## 실제 받는 방법

### AMI: 음성 없이 전사·주석 ZIP부터

공식 다운로드 페이지가 연결하는 주소는 아래와 같다. 웹 확인 도구는 ZIP 본문을 읽지 못했으므로 내부 파일을 직접 검증한 것은 아니다. 페이지에는 현재 ZIP 링크가 공개되어 있고 로그인 요구는 표시되지 않았다. 과거 프로젝트 소개의 가입 안내와 현 배포 경로를 구분한다. [공식 다운로드](https://groups.inf.ed.ac.uk/ami/download/)

```bash
mkdir -p .data/evaluation/ami
curl -fL 'https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip' \
  -o .data/evaluation/ami/ami_public_manual_1.6.2.zip
unzip -l .data/evaluation/ami/ami_public_manual_1.6.2.zip
```

22MB의 수동 전사·주석부터면 시작할 수 있다. ASR 자동 주석을 사람 정답으로 사용하지 않는다. 다운로드 후 동봉 라이선스, 주석 스키마, 요약·발화 포인터 해석, 회의별 누락 여부를 확인한다.

### QMSum: 제공 분할 그대로 받기

공식 저장소의 `data/ALL/jsonl`에 `train.jsonl`, `val.jsonl`, `test.jsonl`이 존재한다. 아래는 다운로드 예시이며 실행하지 않았다. [공식 파일 목록](https://github.com/Yale-LILY/QMSum/tree/main/data/ALL/jsonl)

```bash
mkdir -p .data/evaluation/qmsum
curl -fL 'https://raw.githubusercontent.com/Yale-LILY/QMSum/main/data/ALL/jsonl/test.jsonl' \
  -o .data/evaluation/qmsum/test.jsonl
```

주요 필드는 `meeting_transcripts[].speaker/content`, `topic_list`, `specific_query_list[].query/answer/relevant_text_span`이다. 일반 질문은 전체 회의를 대상으로 하므로 관련 구간이 없다. 결정 관련 질문만 골라도 그것이 회의의 모든 후보를 나열한다는 보장은 없다. [공식 형식 설명](https://github.com/Yale-LILY/QMSum)

### 한국어: AI Hub 회의록 하위셋

[요약문 및 레포트 생성 데이터](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=582)에서 로그인·데이터 신청·승인을 거친 뒤 회의록 파일을 받는다. 공식 표의 회의록 분할은 학습 27,200 / 검증 3,400 / 테스트 3,400이다. 형식은 `passage`, `Summary1`(생성 요약), `Summary2`·`Summary3`(추출 요약) 등이다. 사이트의 전체 구축량과 학습 분할 총합이 다르므로 **전체 수치를 회의 수로 바꾸거나 위 34,000건을 독립 회의 34,000개라고 부르지 않는다.** 다운로드 후 원문 회의 ID·중복 구간을 확인한다.

AI Hub는 승인 후 API 다운로드가 가능하다고 안내한다. 공개 페이지에서 정확한 원본 파일 URL과 라이선스는 확인하지 못했으므로 익명 `curl` URL을 만들지 않는다. 페이지 템플릿의 안심존·국방 등 공통 안내를 이 데이터에 대한 추가 필수 조건으로 단정하지도 않는다. [공식 신청·파일 목록 안내](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=582)

## 우리 평가셋으로 바꾸는 제안

다음은 기존 데이터의 주석이 아니라 **우리가 새로 작성할 추가 정답**이다.

1. AMI에서 결정·문제·행동 정답이 있는 회의를 먼저 사용해 현재 단일 호출과 새 워크플로우를 비교한다. 이것은 기반 평가이며 한국어 Discord 성능을 대신하지 않는다.
2. 한국어 회의록/실제 개발 대화를 확보하고, 입력 대화만 읽는 사람이 후보 묶음·대안·관측 결과·이력·근거·행동·관계를 추가 주석한다. 입력 밖 회의록 요약의 정보는 정답에 넣지 않는다.
3. 기존 정답과 새 정답을 필드로 구분한다. 기존 요약에 없는 제안을 곧바로 오탐으로 판정하지 않고, 추가 주석으로 누락·실제 후보 여부를 판정한다.
4. `proposed/agreed/withdrawn` 관측, 대안 채택·거절, 찬반·충돌·의존은 원문에서 언급된 것만 정답으로 둔다. 근거·담당자·기한 미언급은 빈 값으로 둔다. AI 요약에 출처 표시가 필수가 아니어도 평가자는 입력에 없는 사실을 만들어냈는지 확인한다.
5. 후보 전체 재현율과 관계 재현율은 전체 정답 주석을 완료한 구간에서만 계산한다. 일반 요약을 정답으로 둔 ROUGE 하나로 이 성능을 주장하지 않는다.
6. 데이터셋 이름·버전/커밋·원본 회의 ID·분할·라이선스·SHA-256·추가 주석 버전을 manifest로 기록한다. 영어 원본 번역본은 별도 파생 데이터로 분류하며, 독립 한국어 실사용 시험처럼 집계하지 않는다.

**50개 및 40/10 분할은 아직 추천 초안이다.** 공개 원본의 기존 분할과 독립 회의 수, 추가 주석 비용을 확인한 뒤 확정하는 편이 낫다. 같은 회의의 인접 구간이 양쪽에 들어가는 누출을 막고, 미합의 제안·철회·근거 없음·모순·후보 없음의 커버리지를 우선 확보한다.

## 범위를 넓히지 않은 후보

한국어 국회 회의록 기반 지식 검색 데이터도 공개되어 있다. 공식 규모는 원문 회의록 11,827건, 질의응답 44,033건이며 결정 그래프보다 Q&A에 가깝다. 한국어 정치·의회 도메인을 추가할 때 참고할 수 있지만 개발팀 Discord 평가의 우선 데이터로 권하지 않는다. [AI Hub 공식 데이터](https://aihub.or.kr/aihubdata/data/view.do?dataSetSn=71795)

논증 구조 코퍼스는 찬반 관계를 시험하는 별도 보조 자료가 될 수 있으나 대화의 최종 합의·철회 정답을 대신하지 않는다. 이번 선택에서는 AMI, 한국어 입력 확보, 우리 그래프의 추가 주석에 집중한다.
