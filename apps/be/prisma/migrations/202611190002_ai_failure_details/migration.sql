-- 403으로 쉬는 키를 429 대기와 구분해, 모든 키가 권한 부족이면 인증 장애로 알린다.
ALTER TABLE "NvidiaAccountBudget" ADD COLUMN "forbiddenUntil" REAL NOT NULL DEFAULT 0;

-- 자동 재시도에서 마지막으로 실패한 종류. 잘림처럼 수동 재분석만 남은 사유를 보여 준다.
ALTER TABLE "AnalysisSessionRecovery" ADD COLUMN "failureKind" TEXT;
