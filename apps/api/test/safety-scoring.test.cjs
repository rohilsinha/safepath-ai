const assert = require('node:assert/strict');
const test = require('node:test');

const { MapsService } = require('../dist/maps/maps.service.js');
const { SafetyScoringService } = require('../dist/maps/safety-scoring.service.js');
const { matchDemoEvidenceToRoutes } = require('../dist/maps/demo-safety-evidence.js');
const { CommunityReportsService } = require('../dist/community-reports/community-reports.service.js');
const { JwtAuthGuard } = require('../dist/auth/guards/jwt-auth.guard.js');
const { CommunityReportAreaQueryDto, CreateCommunityReportDto } = require('../dist/community-reports/dto/community-report.dto.js');
const { DestinationSearchDto } = require('../dist/maps/dto/route-search.dto.js');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const categories = [
  'crime_history',
  'recent_incidents_news',
  'community_reports',
  'environmental_factors',
  'crowd_activity',
];

function insufficientAssessment(routeId) {
  return {
    routeId,
    score: null,
    riskLevel: 'insufficient_data',
    status: 'insufficient_data',
    dataCoverage: 0,
    categoryRisks: Object.fromEntries(
      categories.map((category) => [
        category,
          {
            riskValue: null,
            available: false,
            weight: [0.3, 0.25, 0.2, 0.15, 0.1][categories.indexOf(category)],
          },
      ]),
    ),
    weightsUsed: {},
    evidence: [],
    policyVersion: '1.0',
    explanationContext: {},
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('scoring service accepts a valid insufficient-data response', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    jsonResponse({ assessments: [insufficientAssessment('route-1')] });

  const service = new SafetyScoringService({ get: () => undefined });
  const [assessment] = await service.assessRoutes(['route-1']);

  assert.equal(assessment.status, 'insufficient_data');
  assert.equal(assessment.score, null);
  assert.equal(assessment.dataCoverage, 0);
});

test('scoring service accepts a valid calculated assessment', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  // TEST FIXTURE ONLY: synthetic scoring-service output, never production data.
  const result = insufficientAssessment('route-1');
  result.score = 80;
  result.riskLevel = 'low';
  result.status = 'complete';
  result.dataCoverage = 1;
  for (const category of categories) {
    result.categoryRisks[category] = {
      riskValue: 20,
      available: true,
      weight: [0.3, 0.25, 0.2, 0.15, 0.1][categories.indexOf(category)],
    };
  }
  result.weightsUsed = Object.fromEntries(
    categories.map((category) => [
      category,
      [0.3, 0.25, 0.2, 0.15, 0.1][categories.indexOf(category)],
    ]),
  );
  global.fetch = async () => jsonResponse({ assessments: [result] });

  const service = new SafetyScoringService({ get: () => undefined });
  const [assessment] = await service.assessRoutes(['route-1']);

  assert.equal(assessment.status, 'complete');
  assert.equal(assessment.score, 80);
  assert.equal(assessment.riskLevel, 'low');
  assert.equal(assessment.dataCoverage, 1);
});

test('scoring service failure returns unavailable assessments, not fabricated scores', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () => {
    throw new Error('test-only service failure');
  };

  const evidence = {
    id: 'report-1',
    category: 'community_reports',
    sourceReference: 'accepted_community_report',
    description: 'Approved user-submitted information; not a verified crime.',
    observedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    severity: 0.5,
    recency: 0.5,
    confidence: null,
    geographicRelevance: 0.8,
    reportCategory: 'POOR_LIGHTING',
    reportedSeverity: 'MEDIUM',
    routeId: 'route-1',
    segmentId: 'segment-1',
  };
  const service = new SafetyScoringService({ get: () => undefined });
  const [assessment] = await service.assessRoutes(
    ['route-1'],
    { 'route-1': [evidence] },
  );

  assert.equal(assessment.status, 'unavailable');
  assert.equal(assessment.score, null);
  assert.deepEqual(assessment.evidence, [evidence]);
});

test('scoring client validates and preserves community evidence output', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let requestBody;
  const result = insufficientAssessment('route-1');
  result.evidence = [{
    id: 'report-1',
    category: 'community_reports',
    sourceReference: 'accepted_community_report',
    description: 'Approved user-submitted information; not a verified crime.',
    observedAt: new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    severity: 0.5,
    recency: 0.5,
    confidence: null,
    geographicRelevance: 0.8,
    reportCategory: 'POOR_LIGHTING',
    reportedSeverity: 'MEDIUM',
    routeId: 'route-1',
    segmentId: 'segment-1',
    reviewAnalysis: {
      sentimentLabel: 'NEGATIVE',
      sentimentScore: -0.5,
      safetyRelevant: true,
      sentimentConfidence: 0.7,
      safetyRelevanceConfidence: 0.65,
      modelName: 'safepath-lexical',
      modelVersion: '1.0.0',
      analyzedAt: new Date().toISOString(),
    },
  }];
  global.fetch = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return jsonResponse({ assessments: [result] });
  };
  const service = new SafetyScoringService({ get: () => undefined });
  const [assessment] = await service.assessRoutes(['route-1']);

  assert.equal(assessment.status, 'insufficient_data');
  assert.equal(assessment.score, null);
  assert.equal(assessment.evidence[0].reportCategory, 'POOR_LIGHTING');
  assert.equal(
    assessment.evidence[0].reviewAnalysis.sentimentLabel,
    'NEGATIVE',
  );
  assert.deepEqual(
    requestBody.riskValuesByRoute['route-1'],
    Object.fromEntries(categories.map((category) => [category, null])),
  );
});

test('route response preserves Mapbox fields and attaches its assessment', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    jsonResponse({
      routes: [
        {
          distance: 1234,
          duration: 321,
          geometry: {
            type: 'LineString',
            coordinates: [
              [80.2, 12.9],
              [80.3, 13.0],
            ],
          },
        },
      ],
    });

  let requestedUrl;
  const routeFetch = global.fetch;
  global.fetch = async (url) => {
    requestedUrl = new URL(url);
    return routeFetch(url);
  };
  const assessment = insufficientAssessment('route-1');
  const maps = new MapsService(
    { get: () => 'test-only-mapbox-token' },
    { assessRoutes: async () => [assessment] },
    { evidenceForRoutes: async () => ({ 'route-1': [] }) },
  );
  const response = await maps.calculateRoutes({
    origin: { latitude: 12.9, longitude: 80.2 },
    destination: { latitude: 13.0, longitude: 80.3 },
  });

  assert.equal(response.routes[0].distanceMeters, 1234);
  assert.equal(response.routes[0].durationSeconds, 321);
  assert.deepEqual(response.routes[0].geometry.coordinates[0], [80.2, 12.9]);
  assert.equal(
    requestedUrl.pathname,
    '/directions/v5/mapbox/driving/80.2,12.9;80.3,13',
  );
  assert.equal(response.routes[0].safetyAssessment.status, 'insufficient_data');
  assert.equal(response.routes[0].safetyAssessment.score, null);
});

test('demo evidence matches real route segments and leaves unrelated routes unassessed', () => {
  const result = matchDemoEvidenceToRoutes([
    {
      id: 'route-a',
      coordinates: [[80.2707, 13.0827], [80.271, 13.083]],
    },
    {
      id: 'route-b',
      coordinates: [[80.2609, 13.0788], [80.2612, 13.0791]],
    },
    {
      id: 'route-unrelated',
      coordinates: [[77.5946, 12.9716], [77.595, 12.972]],
    },
  ]);

  assert.deepEqual(
    result.evidenceByRoute['route-a'].map((item) => item.category).sort(),
    ['crowd_activity', 'environmental_factors'],
  );
  assert.deepEqual(
    result.evidenceByRoute['route-b'].map((item) => item.category).sort(),
    ['crime_history', 'environmental_factors'],
  );
  assert.equal(result.evidenceByRoute['route-a'][0].isDemo, true);
  assert.equal(
    result.evidenceByRoute['route-a'][0].sourceReference,
    'synthetic_demo_v1',
  );
  assert.equal(result.evidenceByRoute['route-a'][0].longitude, 80.2707);
  assert.equal(result.evidenceByRoute['route-a'][0].distanceMeters, 0);
  assert.equal(result.evidenceByRoute['route-unrelated'].length, 0);
  assert.equal(
    Object.values(result.riskValuesByRoute['route-unrelated']).every(
      (risk) => risk === null,
    ),
    true,
  );
  assert.equal(
    result.riskValuesByRoute['route-a'].community_reports,
    null,
  );
});

test('actual Mapbox routes receive independent demo assessments and only scored routes rank', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    jsonResponse({
      routes: [
        {
          distance: 1200,
          duration: 300,
          geometry: {
            type: 'LineString',
            coordinates: [[80.2707, 13.0827], [80.271, 13.083]],
          },
        },
        {
          distance: 1400,
          duration: 360,
          geometry: {
            type: 'LineString',
            coordinates: [[80.2609, 13.0788], [80.2612, 13.0791]],
          },
        },
        {
          distance: 1500,
          duration: 400,
          geometry: {
            type: 'LineString',
            coordinates: [[77.5946, 12.9716], [77.595, 12.972]],
          },
        },
      ],
    });

  let submittedRiskValues;
  const scoringService = {
    assessRoutes: async (routeIds, _communityEvidence, riskValuesByRoute) => {
      submittedRiskValues = riskValuesByRoute;
      return routeIds.map((routeId) => {
        const assessment = insufficientAssessment(routeId);
        const values = riskValuesByRoute[routeId];
        const available = Object.entries(values).filter(([, risk]) => risk !== null);
        if (available.length > 0) {
          const weights = {
            crime_history: 0.3,
            recent_incidents_news: 0.25,
            community_reports: 0.2,
            environmental_factors: 0.15,
            crowd_activity: 0.1,
          };
          const availableWeight = available.reduce(
            (sum, [category]) => sum + weights[category],
            0,
          );
          const weightedRisk = available.reduce(
            (sum, [category, risk]) => sum + risk * weights[category],
            0,
          ) / availableWeight;
          assessment.score = Math.round(100 - weightedRisk);
          assessment.status = 'complete';
          assessment.riskLevel = 'moderate';
          assessment.dataCoverage = availableWeight;
          assessment.categoryRisks = Object.fromEntries(
            Object.entries(values).map(([category, risk]) => [
              category,
              { riskValue: risk, available: risk !== null, weight: weights[category] },
            ]),
          );
        }
        return assessment;
      });
    },
  };
  const maps = new MapsService(
    { get: () => 'test-only-mapbox-token' },
    scoringService,
    { evidenceForRoutes: async () => ({ 'route-1': [], 'route-2': [], 'route-3': [] }) },
  );

  const result = await maps.calculateRoutes({
    origin: { latitude: 13.0827, longitude: 80.2707 },
    destination: { latitude: 13.0788, longitude: 80.2609 },
  });

  assert.equal(result.routes.length, 3);
  assert.deepEqual(result.routes[0].geometry.coordinates[0], [80.2707, 13.0827]);
  assert.equal(result.routes[0].safetyAssessment.score, 77);
  assert.equal(result.routes[0].safetyAssessment.isDemo, true);
  assert.equal(result.routes[0].safetyRank, 1);
  assert.equal(result.routes[1].safetyAssessment.score, 22);
  assert.equal(result.routes[1].safetyRank, 2);
  assert.equal(result.routes[2].safetyAssessment.score, null);
  assert.equal(result.routes[2].safetyRank, null);
  assert.equal(result.routes[2].safetyAssessment.isDemo, false);
  assert.equal(submittedRiskValues['route-1'].community_reports, null);
  assert.equal(submittedRiskValues['route-3'].environmental_factors, null);
});

test('destination search uses text without inventing proximity when origin is unavailable', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = new URL(url);
    return jsonResponse({
      features: [{
        id: 'mapbox-place-1',
        properties: {
          name_preferred: 'Example Landmark',
          full_address: 'Example Street, Example City',
          coordinates: { longitude: -73.9857, latitude: 40.7484 },
        },
        geometry: { type: 'Point', coordinates: [-73.9857, 40.7484] },
      }],
    });
  };

  const maps = new MapsService(
    { get: () => 'test-only-mapbox-token' },
    { assessRoutes: async () => [] },
    { evidenceForRoutes: async () => ({}) },
  );
  const places = await maps.searchPlaces({ query: 'Example Landmark' });

  assert.equal(requestedUrl.pathname, '/search/searchbox/v1/forward');
  assert.equal(requestedUrl.searchParams.get('q'), 'Example Landmark');
  assert.equal(requestedUrl.searchParams.get('limit'), '5');
  assert.equal(
    requestedUrl.searchParams.get('types'),
    'poi,address,place,city,locality,neighborhood,district,region,street',
  );
  assert.equal(requestedUrl.searchParams.has('country'), false);
  assert.equal(requestedUrl.searchParams.has('proximity'), false);
  assert.deepEqual(places, [{
    id: 'mapbox-place-1',
    name: 'Example Landmark',
    fullAddress: 'Example Street, Example City',
    longitude: -73.9857,
    latitude: 40.7484,
  }]);
});

test('destination search biases by explicit origin and parses Mapbox coordinates', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  let requestedUrl;
  global.fetch = async (url) => {
    requestedUrl = new URL(url);
    return jsonResponse({
      features: [
        {
          id: 'mapbox-place-1',
          properties: {
            name_preferred: 'Nearby Landmark',
            full_address: 'Near Origin',
            coordinates: { longitude: 77.5946, latitude: 12.9716 },
          },
          geometry: { type: 'Point', coordinates: [77.5946, 12.9716] },
        },
        {
          id: 'mapbox-place-2',
          properties: {
            name: 'Coordinate Fallback',
            place_formatted: 'Other Place',
          },
          geometry: { type: 'Point', coordinates: [-73.9857, 40.7484] },
        },
      ],
    });
  };

  const maps = new MapsService(
    { get: () => 'test-only-mapbox-token' },
    { assessRoutes: async () => [] },
    { evidenceForRoutes: async () => ({}) },
  );
  const places = await maps.searchPlaces({
    query: 'Nearby Landmark',
    proximityLatitude: 12.9716,
    proximityLongitude: 77.5946,
  });

  assert.equal(requestedUrl.searchParams.get('q'), 'Nearby Landmark');
  assert.equal(requestedUrl.searchParams.get('proximity'), '77.5946,12.9716');
  assert.equal(requestedUrl.searchParams.has('country'), false);
  assert.deepEqual(
    places.map(({ latitude, longitude }) => [latitude, longitude]),
    [
      [12.9716, 77.5946],
      [40.7484, -73.9857],
    ],
  );
});

test('destination search proximity must be a complete valid coordinate pair', async () => {
  const textOnlyQuery = plainToInstance(DestinationSearchDto, {
    query: 'Text only destination',
  });
  assert.deepEqual(await validate(textOnlyQuery), []);

  for (const query of [
    { query: 'Partial location', proximityLatitude: '12.9' },
    {
      query: 'Out of range',
      proximityLatitude: '91',
      proximityLongitude: '80',
    },
    {
      query: 'Blank location',
      proximityLatitude: '',
      proximityLongitude: '',
    },
  ]) {
    const dto = plainToInstance(DestinationSearchDto, query);
    assert((await validate(dto)).length > 0);
  }
});

test('route evidence is matched against route segments, not only endpoints', async () => {
  const routeReport = {
    id: 'approved-report',
    latitude: 13.0,
    longitude: 80.25,
    category: 'POOR_LIGHTING',
    severity: 'MEDIUM',
    occurredAt: new Date(),
    createdAt: new Date(),
  };
  const unrelatedReport = {
    ...routeReport,
    id: 'unrelated-report',
    longitude: 80.4,
  };
  const prisma = {
    safetyReport: {
      findMany: async () => [routeReport, unrelatedReport],
    },
  };
  const service = new CommunityReportsService(prisma, { get: () => undefined });
  const evidence = await service.evidenceForRoutes([
    {
      id: 'route-1',
      coordinates: [
        [80.2, 12.9],
        [80.3, 13.1],
      ],
    },
  ]);

  assert.equal(evidence['route-1'].length, 1);
  assert.equal(evidence['route-1'][0].id, 'approved-report');
  assert.equal(evidence['route-1'][0].reportCategory, 'POOR_LIGHTING');
  assert.equal(evidence['route-1'][0].confidence, null);
  assert.equal(evidence['route-1'][0].routeId, 'route-1');
});

test('unrelated reports do not enter route scoring or change its assessment', async (t) => {
  const originalFetch = global.fetch;
  t.after(() => {
    global.fetch = originalFetch;
  });
  global.fetch = async () =>
    jsonResponse({
      routes: [{
        distance: 1000,
        duration: 300,
        geometry: {
          type: 'LineString',
          coordinates: [[80.2, 12.9], [80.3, 13.1]],
        },
      }],
    });

  const distantReport = {
    id: 'distant-report',
    latitude: 13,
    longitude: 80.4,
    category: 'POOR_LIGHTING',
    severity: 'CRITICAL',
    occurredAt: new Date(),
    createdAt: new Date(),
  };
  const createMapsService = (reports) => {
    const reportService = new CommunityReportsService({
      safetyReport: { findMany: async () => reports },
    }, { get: () => undefined });
    const scoringService = {
      assessRoutes: async (routeIds, evidenceByRoute) =>
        routeIds.map((routeId) => ({
          ...insufficientAssessment(routeId),
          evidence: evidenceByRoute[routeId],
        })),
    };
    return new MapsService(
      { get: () => 'test-only-mapbox-token' },
      scoringService,
      reportService,
    );
  };
  const request = {
    origin: { latitude: 12.9, longitude: 80.2 },
    destination: { latitude: 13.1, longitude: 80.3 },
  };

  const withoutReports = await createMapsService([]).calculateRoutes(request);
  const withUnrelatedReport = await createMapsService([distantReport]).calculateRoutes(request);

  assert.deepEqual(withUnrelatedReport.routes[0].safetyAssessment, withoutReports.routes[0].safetyAssessment);
  assert.equal(withUnrelatedReport.routes[0].safetyAssessment.status, 'insufficient_data');
  assert.equal(withUnrelatedReport.routes[0].safetyAssessment.score, null);
});

test('route evidence queries only accepted, non-deleted reports', async () => {
  let capturedQuery;
  const service = new CommunityReportsService({
    safetyReport: {
      findMany: async (query) => {
        capturedQuery = query;
        return [];
      },
    },
  }, { get: () => undefined });
  const evidence = await service.evidenceForRoutes([
    { id: 'route-1', coordinates: [[80.2, 12.9], [80.3, 13.0]] },
  ]);

  assert.equal(evidence['route-1'].length, 0);
  assert.deepEqual(capturedQuery.where.status.in, ['ACCEPTED', 'APPROVED']);
  assert.equal(capturedQuery.where.deletedAt, null);
  assert.ok(capturedQuery.where.occurredAt.gte instanceof Date);
  assert.ok(capturedQuery.where.occurredAt.lte instanceof Date);
  assert.ok(capturedQuery.where.latitude.gte < capturedQuery.where.latitude.lte);
  assert.ok(capturedQuery.where.longitude.gte < capturedQuery.where.longitude.lte);
  assert.equal(capturedQuery.take, 500);
});

test('report submission persists the explicitly selected place coordinates', async () => {
  let createArgs;
  const report = {
    id: 'report-1',
    latitude: 12.9716,
    longitude: 77.5946,
    description: 'Poor lighting on this block.',
    category: 'POOR_LIGHTING',
    severity: 'MEDIUM',
    occurredAt: new Date(),
    status: 'ACCEPTED',
    reviewedAt: null,
    createdAt: new Date(),
  };
  const service = new CommunityReportsService({
    safetyReport: {
      findFirst: async () => null,
      create: async (args) => {
        createArgs = args;
        return report;
      },
    },
  }, { get: () => undefined }, { analyzeIfNeeded: async () => {} });

  const result = await service.create('private-user-id', {
    latitude: 12.9716,
    longitude: 77.5946,
    description: report.description,
    category: 'POOR_LIGHTING',
    severity: 'MEDIUM',
    occurredAt: new Date().toISOString(),
  });

  assert.equal(createArgs.data.userId, 'private-user-id');
  assert.equal(createArgs.data.status, 'ACCEPTED');
  assert.equal(createArgs.data.latitude, 12.9716);
  assert.equal(createArgs.data.longitude, 77.5946);
  assert.equal(result.status, 'ACCEPTED');
  assert.equal(Object.hasOwn(result, 'userId'), false);
});

test('report listing includes accepted reports, excludes deleted rows, and paginates', async () => {
  let capturedQuery;
  const service = new CommunityReportsService({
    safetyReport: {
      findMany: async (query) => {
        capturedQuery = query;
        return [];
      },
    },
  }, { get: () => undefined });
  const page = await service.listAccepted({
    minLatitude: 12,
    maxLatitude: 13,
    minLongitude: 80,
    maxLongitude: 81,
    limit: 10,
    offset: 20,
  });

  assert.deepEqual(capturedQuery.where.status.in, ['ACCEPTED', 'APPROVED']);
  assert.equal(capturedQuery.where.deletedAt, null);
  assert.equal(capturedQuery.skip, 20);
  assert.equal(capturedQuery.take, 11);
  assert.equal(page.hasMore, false);
});

test('other users cannot view an owner-only report', async () => {
  const service = new CommunityReportsService({
    safetyReport: {
      findUnique: async () => ({
        id: 'report-1',
        userId: 'owner',
        status: 'REJECTED',
        deletedAt: null,
      }),
    },
  }, { get: () => undefined });

  await assert.rejects(
    service.findVisibleReport('report-1', 'another-user'),
    { status: 404 },
  );
});

test('report DTO validation rejects out-of-range coordinates and long descriptions', async () => {
  const invalidReport = plainToInstance(CreateCommunityReportDto, {
    latitude: 91,
    longitude: 181,
    description: 'x'.repeat(501),
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date().toISOString(),
  });
  const errors = await validate(invalidReport);
  assert.deepEqual(
    errors.map((error) => error.property).sort(),
    ['description', 'latitude', 'longitude'],
  );

  const missingCoordinates = plainToInstance(CreateCommunityReportDto, {
    description: 'An incident without a selected location.',
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date().toISOString(),
  });
  const missingCoordinateErrors = await validate(missingCoordinates);
  assert(missingCoordinateErrors.some((error) => error.property === 'latitude'));
  assert(missingCoordinateErrors.some((error) => error.property === 'longitude'));

  const oversizedBounds = plainToInstance(CommunityReportAreaQueryDto, {
    minLatitude: 10,
    maxLatitude: 13,
    minLongitude: 80,
    maxLongitude: 81,
  });
  const service = new CommunityReportsService(
    { safetyReport: { findMany: async () => [] } },
    { get: () => undefined },
  );
  await assert.rejects(service.listAccepted(oversizedBounds), { status: 400 });
});

test('exact duplicate submission returns the existing report without inserting', async () => {
  const existing = {
    id: 'report-duplicate',
    userId: 'owner',
    latitude: 13,
    longitude: 80,
    description: 'Same report',
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date(),
    status: 'ACCEPTED',
    deletedAt: null,
    reviewedAt: null,
    createdAt: new Date(),
  };
  let createCalled = false;
  const service = new CommunityReportsService({
    safetyReport: {
      findFirst: async () => ({ id: existing.id }),
      findUnique: async () => existing,
      create: async () => {
        createCalled = true;
        return existing;
      },
    },
  }, { get: () => undefined }, { analyzeIfNeeded: async () => {} });
  const result = await service.create('owner', {
    latitude: 13,
    longitude: 80,
    description: 'Same report',
    category: 'OTHER',
    severity: 'MEDIUM',
    occurredAt: new Date().toISOString(),
  });

  test('owner can soft-delete a report and deletion is scoped to JWT user id', async () => {
    let updateArgs;
    const service = new CommunityReportsService({
      safetyReport: {
        updateMany: async (args) => {
          updateArgs = args;
          return { count: 1 };
        },
      },
    }, { get: () => undefined });

    await service.deleteOwnReport('report-id', 'jwt-owner');
    assert.deepEqual(updateArgs.where, {
      id: 'report-id',
      userId: 'jwt-owner',
      deletedAt: null,
    });
    assert.ok(updateArgs.data.deletedAt instanceof Date);
  });

  test('another user cannot delete a report they do not own', async () => {
    let updateArgs;
    const service = new CommunityReportsService({
      safetyReport: {
        updateMany: async (args) => {
          updateArgs = args;
          return { count: 0 };
        },
      },
    }, { get: () => undefined });

    await assert.rejects(
      service.deleteOwnReport('report-id', 'different-jwt-user'),
      { status: 404 },
    );
    assert.equal(updateArgs.where.userId, 'different-jwt-user');
  });

  test('deleting a missing report returns not found', async () => {
    const service = new CommunityReportsService({
      safetyReport: {
        updateMany: async () => ({ count: 0 }),
      },
    }, { get: () => undefined });

    await assert.rejects(
      service.deleteOwnReport('missing-id', 'jwt-owner'),
      { status: 404 },
    );
  });

  test('my reports query contains only the current user non-deleted reports', async () => {
    let capturedQuery;
    const service = new CommunityReportsService({
      safetyReport: {
        findMany: async (query) => {
          capturedQuery = query;
          return [];
        },
      },
    }, { get: () => undefined });
    await service.listMine('jwt-owner');

    assert.deepEqual(capturedQuery.where, {
      userId: 'jwt-owner',
      deletedAt: null,
    });
  });

  assert.equal(result.id, existing.id);
  assert.equal(createCalled, false);
  assert.equal(Object.hasOwn(result, 'userId'), false);
});

test('JWT guard rejects unauthenticated report access', async () => {
  const guard = new JwtAuthGuard({ verifyAsync: async () => ({ sub: 'user', email: 'user@example.test' }) });
  const context = {
    switchToHttp: () => ({
      getRequest: () => ({ headers: {} }),
    }),
  };
  await assert.rejects(guard.canActivate(context), { status: 401 });
});
