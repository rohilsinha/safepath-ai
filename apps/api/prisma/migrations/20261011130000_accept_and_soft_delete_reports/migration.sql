-- No reviewer workflow exists; the previous pending state becomes accepted,
-- while remaining explicitly user-submitted and unverified in application copy.
ALTER TYPE "SafetyReportStatus" RENAME VALUE 'PENDING' TO 'ACCEPTED';

ALTER TABLE "SafetyReport"
    ALTER COLUMN "status" SET DEFAULT 'ACCEPTED',
    ADD COLUMN "deletedAt" TIMESTAMP(3);

DROP INDEX "SafetyReport_status_occurredAt_idx";
DROP INDEX "SafetyReport_status_latitude_longitude_idx";

CREATE INDEX "SafetyReport_status_deletedAt_occurredAt_idx"
    ON "SafetyReport"("status", "deletedAt", "occurredAt");
CREATE INDEX "SafetyReport_status_deletedAt_latitude_longitude_idx"
    ON "SafetyReport"("status", "deletedAt", "latitude", "longitude");
