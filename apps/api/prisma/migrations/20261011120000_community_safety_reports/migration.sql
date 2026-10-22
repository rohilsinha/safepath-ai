-- Existing rows are preserved and remain private/pending by default.
CREATE TYPE "SafetyReportCategory" AS ENUM (
    'HARASSMENT',
    'UNSAFE_AREA',
    'POOR_LIGHTING',
    'SUSPICIOUS_ACTIVITY',
    'OTHER'
);

CREATE TYPE "SafetyReportStatus" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED',
    'FLAGGED'
);

ALTER TABLE "SafetyReport"
    ADD COLUMN "category" "SafetyReportCategory" NOT NULL DEFAULT 'OTHER',
    ADD COLUMN "occurredAt" TIMESTAMP(3),
    ADD COLUMN "status" "SafetyReportStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN "reviewedAt" TIMESTAMP(3),
    ADD COLUMN "reviewNote" TEXT;

CREATE INDEX "SafetyReport_status_occurredAt_idx"
    ON "SafetyReport"("status", "occurredAt");
CREATE INDEX "SafetyReport_status_latitude_longitude_idx"
    ON "SafetyReport"("status", "latitude", "longitude");

ALTER TABLE "SafetyReport"
    ADD CONSTRAINT "SafetyReport_latitude_range_check"
        CHECK ("latitude" BETWEEN -90 AND 90) NOT VALID,
    ADD CONSTRAINT "SafetyReport_longitude_range_check"
        CHECK ("longitude" BETWEEN -180 AND 180) NOT VALID;
