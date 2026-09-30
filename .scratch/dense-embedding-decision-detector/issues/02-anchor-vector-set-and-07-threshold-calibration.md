# 02 — Multi-Anchor Vector Set & 0.70 Threshold Calibration

Type: prototype
Status: open
Blocked by: 01

## Question

How should the multi-anchor cosine comparison (`max(cos_sim(msg, anchor_k)) >= 0.70`) be calibrated against realistic team dialogue?
- Which specific decision anchor sentences produce >= 0.70 on varied Korean agreement phrasing (e.g. "이걸로 못박죠", "이쪽으로 가닥 잡았습니다", "A로 가시죠") while keeping casual chatter strictly below 0.40?
- Should the threshold be configurable via centralized policy?
