const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');
const ts = require('typescript');

const source = readFileSync(join(__dirname, '../src/review-analysis.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleExports = {};
new Function('exports', compiled)(moduleExports);
const { formatSentimentScore, getReviewAnalysisPresentation } = moduleExports;

function analysis(overrides = {}) {
  return {
    status: 'COMPLETED',
    sentimentLabel: 'POSITIVE',
    sentimentScore: 0.8,
    safetyRelevant: true,
    sentimentConfidence: 0.9,
    safetyRelevanceConfidence: 0.85,
    modelName: 'safepath-lexical',
    modelVersion: '1.0.0',
    createdAt: '2026-10-21T00:00:00.000Z',
    ...overrides,
  };
}

test('classifies relevant positive and negative reviews with actual confidence', () => {
  assert.deepEqual(
    getReviewAnalysisPresentation(analysis()),
    {
      kind: 'positive',
      title: 'Positive safety experience',
      badge: 'Positive',
      confidence: 'High confidence',
      icon: '✓',
    },
  );
  assert.equal(
    getReviewAnalysisPresentation(
      analysis({ sentimentLabel: 'NEGATIVE', sentimentScore: -0.8 }),
    ).kind,
    'negative',
  );
});

test('irrelevant, neutral, uncertain, and low-confidence reviews stay unclear', () => {
  for (const result of [
    analysis({ safetyRelevant: false }),
    analysis({ sentimentLabel: 'NEUTRAL' }),
    analysis({ sentimentLabel: 'UNCERTAIN' }),
    analysis({ sentimentConfidence: 0.59 }),
    analysis({ safetyRelevanceConfidence: 0.59 }),
  ]) {
    const presentation = getReviewAnalysisPresentation(result);
    assert.equal(presentation.kind, 'unclear');
    assert.equal('confidence' in presentation, false);
  }
});

test('moderate support is not presented as high confidence', () => {
  const presentation = getReviewAnalysisPresentation(
    analysis({ sentimentConfidence: 0.7, safetyRelevanceConfidence: 0.65 }),
  );
  assert.equal(presentation.kind, 'positive');
  assert.equal(presentation.confidence, 'Moderate confidence');
});

test('pending and failed analyses have separate non-result states', () => {
  assert.equal(getReviewAnalysisPresentation(analysis({ status: 'PENDING' })).kind, 'pending');
  assert.equal(getReviewAnalysisPresentation(analysis({ status: 'FAILED' })).kind, 'failed');
  assert.equal(getReviewAnalysisPresentation(null).kind, 'failed');
});

test('formats the analyzer polarity score on its signed minus-one to plus-one scale', () => {
  assert.equal(formatSentimentScore(0.8), '+0.80');
  assert.equal(formatSentimentScore(-0.8), '-0.80');
  assert.equal(formatSentimentScore(0), '0.00');
  assert.equal(formatSentimentScore(null), null);
  assert.equal(formatSentimentScore(1.01), null);
});
