-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('PLAYING', 'FINAL_ANSWER', 'CLEARED', 'FAILED', 'GAVE_UP');

-- CreateEnum
CREATE TYPE "Verdict" AS ENUM ('TRUE', 'FALSE', 'UNKNOWN', 'MIXED', 'INVALID');

-- CreateTable
CREATE TABLE "Case" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "story" JSONB NOT NULL,
    "maxQuestionCount" INTEGER NOT NULL DEFAULT 30,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameSession" (
    "id" UUID NOT NULL,
    "anonymousId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "questionCount" INTEGER NOT NULL DEFAULT 0,
    "maxQuestionCount" INTEGER NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'PLAYING',
    "finalSubmissionUsed" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "GameSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Question" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "question" TEXT NOT NULL,
    "verdict" "Verdict" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Submission" (
    "id" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "requestId" UUID NOT NULL,
    "answer" TEXT NOT NULL,
    "matchedCount" INTEGER NOT NULL,
    "missingCount" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "isFinal" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaseProgress" (
    "anonymousId" UUID NOT NULL,
    "caseId" UUID NOT NULL,
    "cleared" BOOLEAN NOT NULL DEFAULT false,
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "revealed" BOOLEAN NOT NULL DEFAULT false,
    "bestQuestionCount" INTEGER,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CaseProgress_pkey" PRIMARY KEY ("anonymousId","caseId")
);

-- CreateIndex
CREATE INDEX "GameSession_anonymousId_caseId_startedAt_idx" ON "GameSession"("anonymousId", "caseId", "startedAt");

-- CreateIndex
CREATE INDEX "Question_sessionId_createdAt_idx" ON "Question"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Question_sessionId_requestId_key" ON "Question"("sessionId", "requestId");

-- CreateIndex
CREATE INDEX "Submission_sessionId_createdAt_idx" ON "Submission"("sessionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Submission_sessionId_requestId_key" ON "Submission"("sessionId", "requestId");

-- AddForeignKey
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Question" ADD CONSTRAINT "Question_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaseProgress" ADD CONSTRAINT "CaseProgress_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "Case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma cannot express CHECK constraints or partial unique indexes.
ALTER TABLE "Case" ADD CONSTRAINT "Case_positive_budget" CHECK ("maxQuestionCount" > 0);
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_valid_budget"
  CHECK ("maxQuestionCount" > 0 AND "questionCount" BETWEEN 0 AND "maxQuestionCount");
ALTER TABLE "GameSession" ADD CONSTRAINT "GameSession_valid_state"
  CHECK ((status <> 'PLAYING' OR ("questionCount" < "maxQuestionCount" AND NOT "finalSubmissionUsed"))
    AND (status <> 'FINAL_ANSWER' OR ("questionCount" = "maxQuestionCount" AND NOT "finalSubmissionUsed"))
    AND (status <> 'FAILED' OR "finalSubmissionUsed")
    AND (NOT "finalSubmissionUsed" OR status IN ('CLEARED', 'FAILED'))
    AND ((status IN ('CLEARED', 'FAILED', 'GAVE_UP')) = ("completedAt" IS NOT NULL)));
CREATE UNIQUE INDEX "Submission_one_final_per_session" ON "Submission" ("sessionId") WHERE "isFinal" = true;
ALTER TABLE "Submission" ADD CONSTRAINT "Submission_valid_counts"
  CHECK ("matchedCount" >= 0 AND "missingCount" >= 0 AND success = ("missingCount" = 0));
