# AMI 평가 자료 준비 결과

작업일: 2026-10-14. 공식 AMI 수동 주석을 다운로드해 로컬 평가용 JSONL로 변환했다. 실제 AI 평가와 한국어 데이터 다운로드는 실행하지 않았다.

## 확보한 자료

- 공식 배포: [AMI manual annotations 1.6.2](https://groups.inf.ed.ac.uk/ami/download/).
- 원본 ZIP: `.data/evaluation/ami/ami_public_manual_1.6.2.zip`.
- SHA-256: `b56e5babb2496b8795deeeda7e71178d7fbc9963f94276cf2a3f4b56ebbc9f9d`.
- ZIP의 CRC 검사를 통과했고, 동봉 `LICENCE.txt`에서 CC BY 4.0을 확인했다.
- 다운로드 이름은 1.6.2지만 동봉 README는 2014년 1.7을 표기한다. 두 값을 manifest에 구별해 기록했다.

원본과 생성 데이터는 gitignore된 `.data/`에 보관한다. 라이선스·README·원본 manifest도 생성 데이터 옆에 보존한다.

## 변환 결과

| 항목                         |     수량 |
| ---------------------------- | -------: |
| 대화·요약을 함께 확보한 회의 |      142 |
| 공식 scenario-only train     |       98 |
| 공식 scenario-only dev       |       20 |
| 공식 scenario-only test      |       20 |
| scenario-only 분할 외 회의   |        4 |
| 유효 결정 요약 문장          |      694 |
| 유효 후속 행동 요약 문장     |      287 |
| 유효 문제 요약 문장          |      446 |
| 결정 구간 주석 파일 / 요소   | 47 / 288 |
| 변환 중 발견한 참조 오류     |        0 |

정답 문장 수는 독립적인 검수 후보 수가 아니다. `*NA*` 등 빈 표식은 정답 목록에서 제외하고 원래 값은 별도 보존한다. [공식 scenario-only 분할](https://groups.inf.ed.ac.uk/ami/corpus/datasets.shtml)을 사용하며 비시나리오 회의 4개는 `unassigned.jsonl`로 분리한다. 잠정 50개·40/10 분할을 임의로 적용하지 않았다.

## 파일과 사용 방법

694개 결정 요약 중 624개는 연결된 발화가 있고 70개는 연결이 없다. 연결 누락을 변환기가 임의로 채우지 않았다. 입력 대화 없이 정답을 추정하지 않으며, 발화 연결에 기반한 평가에서는 연결이 있는 항목을 별도로 선별한다.

변환 도구는 [prepare_ami.py](../../scripts/evaluation/prepare_ami.py)다. Python 3.10 이상에서 표준 라이브러리만 사용하며 네트워크·AI 호출·앱 DB 쓰기를 하지 않는다.

```bash
python3 -B scripts/evaluation/prepare_ami.py
python3 -B -m unittest discover -s scripts/evaluation -p 'test_*.py'
```

생성 위치: `.data/evaluation/ami/prepared/`.

| 파일                                     | 용도                                              |
| ---------------------------------------- | ------------------------------------------------- |
| `meetings.jsonl`                         | 142개 전체 회의                                   |
| `train.jsonl`, `dev.jsonl`, `test.jsonl` | 공식 scenario-only 분할                           |
| `unassigned.jsonl`                       | 해당 분할 외 회의                                 |
| `sample-TS3004a.json`                    | 개발 분할의 읽기 쉬운 단일 예시                   |
| `manifest.json`                          | 출처·라이선스·원본/생성물 checksum·분할·변환 방식 |
| `annotation-inventory.json`              | 원본 주석 종류·수량·논증 ontology                 |
| `source-issues.json`                     | 참조 해석 오류; 현재 빈 목록                      |

각 회의의 `input.utterances`에는 화자·초 단위 상대 시각·대화 텍스트가 들어 있다. `originalGold.summaries`에는 원래 결정/문제/행동/전체 요약과 연결된 발화 ID가 들어 있다. 입력과 정답은 별도 필드이며 모델 입력에는 `input`만 사용해야 한다. 정답 요약을 모델에 같이 전달하면 평가 누출이다.

`originalGold.decisionPoints`는 원본 결정 구간 ID와 단어 참조를 보존한다. 이 필드는 새 Candidate나 합의 판정 정답을 자동 생성하지 않는다. JSON은 기존 BE HTTP 요청 DTO가 아니라 중립적인 평가 자료다. 앱에 연결하는 runner는 별도 구현 대상이다.

발화행위 주석이 있으면 그 단위로, 없으면 전사 구간 단위로 대화를 구성한다. `input.transcriptLayer`가 사용한 층을 표시한다. IB4005/IB4010/IB4011은 발화행위가 없어 구간 전사를 사용한다. 단어를 공백으로 연결하고 비단어 음성 표식은 제외하며, 발화 시작 시각 순으로 정렬한다. 시각이 없는 발화는 뒤에 두고 누락 값을 만들지 않는다. 겹치는 발화를 하나의 확정된 응답 순서로 해석하지 않는다.

## 실제 ZIP 확인으로 보완한 연구 결과

웹 주석 설명과 달리 배포 ZIP에는 다음 논증 주석이 실제 존재한다.

- `argumentation/ae`: 파일 376개, 논증 요소 6,920개.
- `argumentation/ar`: 파일 94개, 관계 4,759개.
- `argumentation/dis`: 파일 95개, discussion fragment 237개.
- 관계 ontology: Positive, Negative, Uncertain, Option, Elaboration, Specialization, Subject-to, Option-exclusion, Request.

이 존재 여부와 수량은 실제 ZIP을 읽은 결과다. 앞선 연구의 ‘공개 정답 여부 미확인’을 보완한다. 우리 Topic/Issue/Candidate/Alternative/Rationale/Action Item 및 충돌·의존 관계와 동일한 계약이라고 단정하지 않으며, 이번에는 목록·ontology만 추출했다. 실제 그래프 평가에 쓰려면 주석 지침·범위·우리 관계로의 매핑을 별도로 확인해야 한다.

## 평가에 사용할 수 있는 범위

AMI는 영어 회의의 사람 결정 요약과 발화 연결에 대한 기반 평가에 사용할 수 있다. 미합의 제안 전수·철회 이력·우리 후보 묶음·논리 그래프 전체의 완전한 정답은 아직 아니다. `coverage`에 추가 주석 필요를 명시했다.

현재 자료만으로 합의 없는 제안까지 포함한 후보 정밀도/재현율이나 우리 관계 정밀도/재현율 90% 통과를 주장하지 않는다. 기존 요약에 없는 제안을 모두 오탐으로 처리하지 않는다. 한국어 실제 대화와 추가 정답 작성, 정답 완전성·독립 분할은 마지막 설계 티켓에서 결정한다.

한국어 AI Hub 자료는 신청·승인이 필요한 상태로 남아 있다. 이번 AMI 확보가 한국어 평가 준비 완료를 뜻하지 않는다.
