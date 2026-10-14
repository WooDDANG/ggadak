# 02 — Multi-Anchor Vector Set & 0.70 Threshold Calibration

Type: prototype
Status: needs-triage
Blocked by: 01

## Question

How should the multi-anchor cosine comparison (`max(cos_sim(msg, anchor_k)) >= 0.70`) be calibrated against realistic team dialogue?
- Which specific decision anchor sentences produce >= 0.70 on varied Korean agreement phrasing (e.g. "이걸로 못박죠", "이쪽으로 가닥 잡았습니다", "A로 가시죠") while keeping casual chatter strictly below 0.40?
- Should the threshold be configurable via centralized policy?

## Comments

2026-10-14: Corpus와 중앙 threshold는 구현돼 있다. 실제 대화 오탐/미탐 평가와 임계값 선정 근거가 남았다. 현재 점수는 문자·단어 특징 기반 재조정 cosine이므로 신경망 dense embedding으로 해석하지 않는다.
