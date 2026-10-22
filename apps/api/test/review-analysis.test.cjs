const assert = require('node:assert/strict');
const test = require('node:test');
const { createHash } = require('node:crypto');

const {
  CommunityReportsService,
} = require('../dist/community-reports/community-reports.service.js');
const {
  ReviewAnalysisService,
} = require('../dist/community-reports/review-analysis.service.js');

function recordKey(value) {
  return [
    value.safetyReportId,
    value.textHash,
    value.modelName,
    value.modelVersion,
  ].join('|');
}

function createAnalysisPrisma(initialRecords = []) {
  const records = new Map(
    initialRecords.map((record) => [recordKey(record), { ...record }]),
  );
  let nextId = 0;

  return {
    records,
    reviewAnalysis: {
      findUnique: async ({ where }) =>
        records.get(recordKey(
          where.safetyReportId_textHash_modelName_modelVersion,
        )) ?? null,
      create: async ({ data }) => {
        const key = recordKey(data);
        if (records.has(key)) {
          const error = new Error('Unique constraint');
          error.code = 'P2002';
          throw error;
        }
        const now = new Date();
        const record = {
          id: `analysis-${++nextId}`,
          ...data,
          createdAt: now,
          updatedAt: now,
          sentimentLabel: null,
          sentimentScore: null,
          safetyRelevant: null,
          sentimentConfidence: null,
          safetyRelevanceConfidence: null,
        };
        records.set(key, record);
        return record;
      },
      updateMany: async ({ where, data }) => {
        const record = [...records.values()].find((item) => {
          if (item.id !== where.id || item.status !== where.status) return false;
          return (
            where.updatedAt === undefined ||
            item.updatedAt.getTime() === where.updatedAt.getTime()
          );
        });
        if (!record) return { count: 0 };
        Object.assign(record, data, { updatedAt: new Date() });
        return { count: 1 };
      },
    },
  };
}

function successfulAnalysis() {
  return {
    sentiment: { label: 'NEGATIVE', score: -1, confidence: 0.7 },
    safetyRelevance: { isRelevant: true, confidence: 0.65 },
    modelName: 'safepath-lexical',
    modelVersion: '1.0.0',
  };
}

function jsonResponse(value) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('same text is reused while changed text and model versions retain history', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    return jsonResponse(successfulAnalysis());
  };

  const text = 'The street was dark.';
  const textHash = createHash('sha256').update(text, 'utf8').digest('hex');
  const olderVersion = {
    id: 'prior-analysis',
    safetyReportId: 'report-1',
    textHash,
    modelName: 'safepath-lexical',
    modelVersion: '0.9.0',
    status: 'COMPLETED',
    sentimentLabel: 'NEGATIVE',
    sentimentScore: -1,
    safetyRelevant: true,
    sentimentConfidence: 0.5,
    safetyRelevanceConfidence: 0.5,
    createdAt: new Date('2026-10-01T00:00:00Z'),
    updatedAt: new Date('2026-10-01T00:00:00Z'),
  };
  const prisma = createAnalysisPrisma([olderVersion]);
  const service = new ReviewAnalysisService(prisma, { get: () => undefined });

  await service.analyzeIfNeeded({ id: 'report-1', description: text });
  await service.analyzeIfNeeded({ id: 'report-1', description: text });

  assert.equal(requestCount, 1);
  assert.equal(prisma.records.size, 2);
  assert.equal(prisma.records.get(recordKey(olderVersion)).modelVersion, '0.9.0');
  assert.equal(
    [...prisma.records.values()].find((item) => item.modelVersion === '1.0.0').status,
    'COMPLETED',
  );

  await service.analyzeIfNeeded({
    id: 'report-1',
    description: 'The street is bright and safe.',
  });
  assert.equal(requestCount, 2);
  assert.equal(prisma.records.size, 3);
});

test('failed analyses are marked and safely retried without losing the report', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let requestCount = 0;
  global.fetch = async () => {
    requestCount += 1;
    if (requestCount === 1) throw new Error('test-only unavailable service');
    return jsonResponse(successfulAnalysis());
  };

  const prisma = createAnalysisPrisma();
  const service = new ReviewAnalysisService(prisma, { get: () => undefined });
  const review = { id: 'report-2', description: 'Unsafe crossing.' };

  await assert.rejects(service.analyzeIfNeeded(review));
  const failedAnalysis = [...prisma.records.values()][0];
  assert.equal(failedAnalysis.status, 'FAILED');
  failedAnalysis.updatedAt = new Date(Date.now() - 31_000);
  await service.analyzeIfNeeded(review);

  assert.equal(requestCount, 2);
  assert.equal([...prisma.records.values()][0].status, 'COMPLETED');
});

test('analysis failure does not fail or discard the persisted report', async () => {
  const report = {
    id: 'report-preserved',
    latitude: 13,
    longitude: 80,
    description: 'A real submitted report.',
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date(),
    status: 'ACCEPTED',
    createdAt: new Date(),
  };
  const service = new CommunityReportsService(
    {
      safetyReport: {
        findFirst: async () => null,
        create: async () => report,
        findUnique: async () => ({
          ...report,
          userId: 'reporter',
          deletedAt: null,
          reviewAnalyses: [],
        }),
      },
    },
    { get: () => undefined },
    { analyzeIfNeeded: async () => {
      throw new Error('test-only analysis failure');
    } },
  );

  const result = await service.create('reporter', {
    latitude: 13,
    longitude: 80,
    description: report.description,
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date().toISOString(),
  });

  assert.equal(result.id, report.id);
  assert.equal(result.description, report.description);
  assert.equal(result.reviewAnalysis, null);
});

test('submission response includes the persisted latest review analysis', async () => {
  const report = {
    id: 'report-analyzed',
    latitude: 13,
    longitude: 80,
    description: 'The route was well lit.',
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date(),
    status: 'ACCEPTED',
    createdAt: new Date(),
  };
  const persistedAnalysis = {
    status: 'COMPLETED',
    sentimentLabel: 'POSITIVE',
    sentimentScore: 0.8,
    safetyRelevant: true,
    sentimentConfidence: 0.9,
    safetyRelevanceConfidence: 0.85,
    modelName: 'safepath-lexical',
    modelVersion: '1.0.0',
    createdAt: new Date(),
  };
  const service = new CommunityReportsService(
    {
      safetyReport: {
        findFirst: async () => null,
        create: async () => report,
        findUnique: async () => ({
          ...report,
          userId: 'reporter',
          deletedAt: null,
          reviewAnalyses: [persistedAnalysis],
        }),
      },
    },
    { get: () => undefined },
    { analyzeIfNeeded: async () => {} },
  );

  const result = await service.create('reporter', {
    latitude: 13,
    longitude: 80,
    description: report.description,
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date().toISOString(),
  });

  assert.equal(result.reviewAnalysis.status, 'COMPLETED');
  assert.equal(result.reviewAnalysis.sentimentLabel, 'POSITIVE');
  assert.equal(result.reviewAnalysis.safetyRelevant, true);
  assert.equal(result.reviewAnalysis.modelVersion, '1.0.0');
});

test('route evidence attaches only a current-text completed analysis once per report', async () => {
  const matchingDescription = 'Poor lighting on this street.';
  const matchingHash = createHash('sha256')
    .update(matchingDescription, 'utf8')
    .digest('hex');
  const occurredAt = new Date();
  const matching = {
    id: 'report-matching',
    latitude: 13,
    longitude: 80.25,
    description: matchingDescription,
    category: 'POOR_LIGHTING',
    severity: 'MEDIUM',
    occurredAt,
    createdAt: occurredAt,
    reviewAnalyses: [{
      textHash: matchingHash,
      sentimentLabel: 'NEGATIVE',
      sentimentScore: -1,
      safetyRelevant: true,
      sentimentConfidence: 0.7,
      safetyRelevanceConfidence: 0.65,
      modelName: 'safepath-lexical',
      modelVersion: '1.0.0',
      createdAt: occurredAt,
    }],
  };
  const stale = {
    ...matching,
    id: 'report-stale',
    description: 'The text changed after analysis.',
    category: 'OTHER',
    reviewAnalyses: matching.reviewAnalyses,
  };
  let capturedQuery;
  const service = new CommunityReportsService(
    {
      safetyReport: {
        findMany: async (query) => {
          capturedQuery = query;
          return [matching, stale, matching];
        },
      },
    },
    { get: () => undefined },
    { analyzeIfNeeded: async () => {} },
  );

  const evidence = await service.evidenceForRoutes([{
    id: 'route-1',
    coordinates: [[80.2, 12.9], [80.3, 13.1]],
  }]);
  const results = evidence['route-1'];

  assert.equal(capturedQuery.where.deletedAt, null);
  assert.deepEqual(capturedQuery.where.status.in, ['ACCEPTED', 'APPROVED']);
  assert.equal(capturedQuery.select.reviewAnalyses.where.status, 'COMPLETED');
  assert.equal(results.length, 2);
  assert.equal(results[0].reviewAnalysis.sentimentLabel, 'NEGATIVE');
  assert.equal(Object.hasOwn(results[1], 'reviewAnalysis'), false);
});
