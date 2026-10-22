import {
  SafetyCategory,
  SAFETY_CATEGORIES,
} from './safety-scoring.service';
import { closestPointOnRoute } from '../community-reports/community-reports.service';

export type DemoEvidenceCategory = Exclude<
  SafetyCategory,
  'community_reports'
>;

export interface DemoEvidenceRecord {
  id: string;
  category: DemoEvidenceCategory;
  sourceReference: 'synthetic_demo_v1';
  description: string;
  longitude: number;
  latitude: number;
  observedAt: string;
  collectedAt: string;
  riskValue: number;
}

export interface MatchedDemoEvidence extends DemoEvidenceRecord {
  isDemo: true;
  geographicRelevance: number;
  distanceMeters: number;
  routeId: string;
  segmentId: string;
}

export interface DemoRouteGeometry {
  id: string;
  coordinates: [number, number][];
}

export interface DemoRouteEvidence {
  evidenceByRoute: Record<string, MatchedDemoEvidence[]>;
  riskValuesByRoute: Record<string, Record<SafetyCategory, number | null>>;
}

export const DEMO_EVIDENCE_PROXIMITY_METERS = 1000;

const DEMO_EVIDENCE: readonly DemoEvidenceRecord[] = [
  {
    id: 'demo-chennai-a-environment',
    category: 'environmental_factors',
    sourceReference: 'synthetic_demo_v1',
    description:
      'DEMO scenario value only. Synthetic, not an observed event or verified data.',
    longitude: 80.2707,
    latitude: 13.0827,
    observedAt: '2026-10-01T00:00:00.000Z',
    collectedAt: '2026-10-01T00:00:00.000Z',
    riskValue: 25,
  },
  {
    id: 'demo-chennai-a-crowd',
    category: 'crowd_activity',
    sourceReference: 'synthetic_demo_v1',
    description:
      'DEMO scenario value only. Synthetic, not an observed event or verified data.',
    longitude: 80.2707,
    latitude: 13.0827,
    observedAt: '2026-10-01T00:00:00.000Z',
    collectedAt: '2026-10-01T00:00:00.000Z',
    riskValue: 20,
  },
  {
    id: 'demo-chennai-b-environment',
    category: 'environmental_factors',
    sourceReference: 'synthetic_demo_v1',
    description:
      'DEMO scenario value only. Synthetic, not an observed event or verified data.',
    longitude: 80.2609,
    latitude: 13.0788,
    observedAt: '2026-10-01T00:00:00.000Z',
    collectedAt: '2026-10-01T00:00:00.000Z',
    riskValue: 75,
  },
  {
    id: 'demo-chennai-b-crime-history',
    category: 'crime_history',
    sourceReference: 'synthetic_demo_v1',
    description:
      'DEMO scenario value only. Synthetic, not an observed event or verified data.',
    longitude: 80.2609,
    latitude: 13.0788,
    observedAt: '2026-10-01T00:00:00.000Z',
    collectedAt: '2026-10-01T00:00:00.000Z',
    riskValue: 80,
  },
];

export function matchDemoEvidenceToRoutes(
  routes: DemoRouteGeometry[],
): DemoRouteEvidence {
  const evidenceByRoute: Record<string, MatchedDemoEvidence[]> =
    Object.fromEntries(routes.map((route) => [route.id, []]));
  const riskValuesByRoute: DemoRouteEvidence['riskValuesByRoute'] =
    Object.fromEntries(
      routes.map((route) => [
        route.id,
        Object.fromEntries(
          SAFETY_CATEGORIES.map((category) => [category, null]),
        ) as Record<SafetyCategory, number | null>,
      ]),
    );

  for (const route of routes) {
    const matched = DEMO_EVIDENCE.flatMap((record) => {
      const closest = closestPointOnRoute(
        { latitude: record.latitude, longitude: record.longitude },
        route.coordinates,
      );
      if (closest.distanceMeters > DEMO_EVIDENCE_PROXIMITY_METERS) {
        return [];
      }
      return [{
        ...record,
        isDemo: true as const,
        geographicRelevance: Math.max(
          0,
          1 - closest.distanceMeters / DEMO_EVIDENCE_PROXIMITY_METERS,
        ),
        distanceMeters: closest.distanceMeters,
        routeId: route.id,
        segmentId: `segment-${closest.segmentIndex + 1}`,
      }];
    });

    evidenceByRoute[route.id] = matched;
    for (const category of new Set(matched.map((record) => record.category))) {
      const values = matched
        .filter((record) => record.category === category)
        .map((record) => record.riskValue);
      riskValuesByRoute[route.id][category] =
        values.reduce((sum, value) => sum + value, 0) / values.length;
    }
  }

  return { evidenceByRoute, riskValuesByRoute };
}
