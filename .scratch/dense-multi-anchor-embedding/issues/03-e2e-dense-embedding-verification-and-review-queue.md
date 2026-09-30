# 03 — E2E Dense Embedding Verification & Review Queue Flow

**What to build:** Full end-to-end pipeline test verifying that arbitrary Korean and English decision sentences (even with zero literal keyword overlap) achieve >= 0.70 dense similarity, trigger the bot silently, and produce a structured candidate card in the Web Review Queue (`http://localhost:3000`).

**Blocked by:** 01 — Multi-Anchor Dense Embedding Corpus & Evaluator, 02 — Bot Dense Similarity Trigger & Real-Time Context Harvesting

**Status:** resolved

- [x] Verify diverse Korean natural agreement phrases ("이쪽으로 가닥 잡고 진행합시다", "우리 결제 모듈만 먼저 쳐내고 갑시다") score >= 0.70.
- [x] Verify casual chatter ("점심 뭐 먹을래요", "영화 보러 가실 분") scores < 0.40 and is ignored.
- [x] Verify end-to-end flow from message creation to Review Queue candidate card creation.
- [x] All monorepo test suites passing (`npm run build && npm test`).
