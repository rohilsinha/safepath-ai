CREATE TYPE "ReviewSentimentLabel" AS ENUM (
    'POSITIVE',
    'NEUTRAL',
    'NEGATIVE',
    'UNCERTAIN'
);

CREATE TYPE "ReviewAnalysisStatus" AS ENUM (
    'PENDING',
    'COMPLETED',
    'FAILED'
);

CREATE TABLE "ReviewAnalysis" (
    "id" UUID NOT NULL,
    "safetyReportId" UUID NOT NULL,
    "textHash" CHAR(64) NOT NULL,
    "sentimentLabel" "ReviewSentimentLabel",
    "sentimentScore" DOUBLE PRECISION,
    "safetyRelevant" BOOLEAN,
    "sentimentConfidence" DOUBLE PRECISION,
    "safetyRelevanceConfidence" DOUBLE PRECISION,
    "status" "ReviewAnalysisStatus" NOT NULL DEFAULT 'PENDING',
    "modelName" TEXT NOT NULL,
    "modelVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReviewAnalysis_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReviewAnalysis_sentimentScore_range_check"
        CHECK ("sentimentScore" IS NULL OR "sentimentScore" BETWEEN -1 AND 1),
    CONSTRAINT "ReviewAnalysis_sentimentConfidence_range_check"
        CHECK ("sentimentConfidence" IS NULL OR "sentimentConfidence" BETWEEN 0 AND 1),
    CONSTRAINT "ReviewAnalysis_safetyRelevanceConfidence_range_check"
        CHECK ("safetyRelevanceConfidence" IS NULL OR "safetyRelevanceConfidence" BETWEEN 0 AND 1),
    CONSTRAINT "ReviewAnalysis_completed_results_check"
        CHECK (
            "status" <> 'COMPLETED'
            OR (
                "sentimentLabel" IS NOT NULL
                AND "sentimentScore" IS NOT NULL
                AND "safetyRelevant" IS NOT NULL
                AND "sentimentConfidence" IS NOT NULL
                AND "safetyRelevanceConfidence" IS NOT NULL
            )
        ),
    CONSTRAINT "ReviewAnalysis_safetyReportId_fkey"
        FOREIGN KEY ("safetyReportId")
        REFERENCES "SafetyReport"("id")
        ON DELETE CASCADE
        ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReviewAnalysis_report_text_model_key"
    ON "ReviewAnalysis"("safetyReportId", "textHash", "modelName", "modelVersion");

CREATE INDEX "ReviewAnalysis_report_created_idx"
    ON "ReviewAnalysis"("safetyReportId", "createdAt");

CREATE INDEX "ReviewAnalysis_status_updated_idx"
    ON "ReviewAnalysis"("status", "updatedAt");
