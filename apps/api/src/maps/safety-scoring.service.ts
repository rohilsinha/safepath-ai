import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export const SAFETY_CATEGORIES = [
  'crime_history',
  'recent_incidents_news',
  'community_reports',
  'environmental_factors',
  'crowd_activity',
] as const;

export type SafetyCategory = (typeof SAFETY_CATEGORIES)[number];
export type SafetyStatus = 'complete' | 'insufficient_data' | 'unavailable';
export type SafetyRiskLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'
  | 'insufficient_data';
export type ReportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface SafetyEvidenceRecord {
  id: string;
  category: SafetyCategory;
  sourceReference: string;
  description: string;
  observedAt: string;
  collectedAt: string;
  severity: number;
  recency: number;
  confidence: number | null;
  geographicRelevance: number;
  reportCategory?: string;
  reportedSeverity?: ReportSeverity;
  routeId?: string;
  segmentId?: string;
  reviewAnalysis?: {
    sentimentLabel: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE' | 'UNCERTAIN';
    sentimentScore: number;
    safetyRelevant: boolean;
    sentimentConfidence: number;
    safetyRelevanceConfidence: number;
    modelName: string;
    modelVersion: string;
    analyzedAt: string;
  };
}

export interface DemoSafetyEvidenceRecord {
  id: string;
  category: Exclude<SafetyCategory, 'community_reports'>;
  sourceReference: 'synthetic_demo_v1';
  description: string;
  longitude: number;
  latitude: number;
  observedAt: string;
  collectedAt: string;
  riskValue: number;
  isDemo: true;
  geographicRelevance: number;
  distanceMeters: number;
  routeId: string;
  segmentId: string;
}

export interface SafetyCategoryRisk {
  riskValue: number | null;
  available: boolean;
  weight: number | null;
}

export interface SafetyAssessmentResponse {
  routeId: string;
  score: number | null;
  riskLevel: SafetyRiskLevel;
  status: SafetyStatus;
  dataCoverage: number;
  categoryRisks: Record<SafetyCategory, SafetyCategoryRisk>;
  weightsUsed: Partial<Record<SafetyCategory, number>>;
  evidence: SafetyEvidenceRecord[];
  demoEvidence: DemoSafetyEvidenceRecord[];
  isDemo: boolean;
  policyVersion: string;
  explanationContext: Record<string, unknown>;
}

const SCORING_TIMEOUT_MS = 3_000;
const VALID_RISK_LEVELS = new Set<SafetyRiskLevel>([
  'low',
  'moderate',
  'high',
  'very_high',
  'insufficient_data',
]);

@Injectable()
export class SafetyScoringService {
  private readonly logger = new Logger(SafetyScoringService.name);

  constructor(private readonly configService: ConfigService) {}

  async assessRoutes(
    routeIds: string[],
    evidenceByRoute: Record<string, SafetyEvidenceRecord[]> = {},
    riskValuesByRoute: Record<
      string,
      Record<SafetyCategory, number | null>
    > = {},
  ): Promise<SafetyAssessmentResponse[]> {
    const fallback = routeIds.map((routeId) => ({
      ...unavailableSafetyAssessment(routeId),
      evidence: evidenceByRoute[routeId] ?? [],
    }));
    const scoringUrl =
      this.configService.get<string>('SAFETY_SCORING_URL')?.trim() ||
      'http://127.0.0.1:8001/assess';

    try {
      const response = await fetch(scoringUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          routeIds,
          evidenceByRoute,
          riskValuesByRoute: Object.fromEntries(
            routeIds.map((routeId) => [
              routeId,
              riskValuesByRoute[routeId] ??
                Object.fromEntries(
                  SAFETY_CATEGORIES.map((category) => [category, null]),
                ),
            ]),
          ),
        }),
        signal: AbortSignal.timeout(SCORING_TIMEOUT_MS),
      });
      if (!response.ok) {
        this.logger.warn(
          'Safety scoring service returned an unsuccessful response; routes will have unavailable assessments.',
        );
        return fallback;
      }

      const payload: unknown = await response.json();
      const assessments = readAssessments(payload, routeIds);
      if (!assessments) {
        this.logger.warn(
          'Safety scoring service returned an invalid response; routes will have unavailable assessments.',
        );
        return fallback;
      }
      return assessments;
    } catch {
      this.logger.warn(
        'Safety scoring service is unavailable; routes will have unavailable assessments.',
      );
      return fallback;
    }
  }
}

export function unavailableSafetyAssessment(
  routeId: string,
): SafetyAssessmentResponse {
  return {
    routeId,
    score: null,
    riskLevel: 'insufficient_data',
    status: 'unavailable',
    dataCoverage: 0,
    categoryRisks: Object.fromEntries(
      SAFETY_CATEGORIES.map((category) => [
        category,
        { riskValue: null, available: false, weight: null },
      ]),
    ) as Record<SafetyCategory, SafetyCategoryRisk>,
    weightsUsed: {},
    evidence: [],
    demoEvidence: [],
    isDemo: false,
    policyVersion: 'unavailable',
    explanationContext: {},
  };
}

function readAssessments(
  payload: unknown,
  expectedRouteIds: string[],
): SafetyAssessmentResponse[] | undefined {
  if (!isRecord(payload) || !Array.isArray(payload.assessments)) {
    return undefined;
  }
  if (payload.assessments.length !== expectedRouteIds.length) {
    return undefined;
  }

  const assessments: SafetyAssessmentResponse[] = [];
  for (let index = 0; index < payload.assessments.length; index += 1) {
    const assessment = parseAssessment(payload.assessments[index]);
    if (!assessment || assessment.routeId !== expectedRouteIds[index]) {
      return undefined;
    }
    assessments.push(assessment);
  }
  return assessments;
}

function parseAssessment(value: unknown): SafetyAssessmentResponse | undefined {
  if (
    !isRecord(value) ||
    typeof value.routeId !== 'string' ||
    typeof value.status !== 'string' ||
    !['complete', 'insufficient_data'].includes(value.status) ||
    typeof value.riskLevel !== 'string' ||
    !VALID_RISK_LEVELS.has(value.riskLevel as SafetyRiskLevel) ||
    !(value.score === null || isIntegerInRange(value.score, 0, 100)) ||
    !isFiniteInRange(value.dataCoverage, 0, 1) ||
    typeof value.policyVersion !== 'string' ||
    !isRecord(value.categoryRisks) ||
    !isRecord(value.weightsUsed) ||
    !Array.isArray(value.evidence) ||
    !isRecord(value.explanationContext)
  ) {
    return undefined;
  }

  const categoryRisks = {} as Record<SafetyCategory, SafetyCategoryRisk>;
  for (const category of SAFETY_CATEGORIES) {
    const risk = value.categoryRisks[category];
    if (
      !isRecord(risk) ||
      !(risk.riskValue === null || isFiniteInRange(risk.riskValue, 0, 100)) ||
      typeof risk.available !== 'boolean' ||
      risk.available !== (risk.riskValue !== null) ||
      !isFiniteInRange(risk.weight, 0, 1)
    ) {
      return undefined;
    }
    categoryRisks[category] = {
      riskValue: risk.riskValue,
      available: risk.available,
      weight: risk.weight,
    };
  }

  const weightsUsed: Partial<Record<SafetyCategory, number>> = {};
  for (const [category, weight] of Object.entries(value.weightsUsed)) {
    if (
      !SAFETY_CATEGORIES.includes(category as SafetyCategory) ||
      !isFiniteInRange(weight, 0, 1)
    ) {
      return undefined;
    }
    weightsUsed[category as SafetyCategory] = weight;
  }

  const evidence: SafetyEvidenceRecord[] = [];
  for (const item of value.evidence) {
    const parsed = parseEvidence(item);
    if (!parsed) {
      return undefined;
    }
    evidence.push(parsed);
  }

  if (
    (value.status === 'complete' && value.score === null) ||
    (value.status === 'insufficient_data' &&
      (value.score !== null || value.riskLevel !== 'insufficient_data'))
  ) {
    return undefined;
  }

  return {
    routeId: value.routeId,
    score: value.score,
    riskLevel: value.riskLevel as SafetyRiskLevel,
    status: value.status as SafetyStatus,
    dataCoverage: value.dataCoverage,
    categoryRisks,
    weightsUsed,
    evidence,
    demoEvidence: [],
    isDemo: false,
    policyVersion: value.policyVersion,
    explanationContext: value.explanationContext,
  };
}

function parseEvidence(value: unknown): SafetyEvidenceRecord | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== 'string' ||
    typeof value.category !== 'string' ||
    !SAFETY_CATEGORIES.includes(value.category as SafetyCategory) ||
    typeof value.sourceReference !== 'string' ||
    typeof value.description !== 'string' ||
    typeof value.observedAt !== 'string' ||
    typeof value.collectedAt !== 'string' ||
    !isFiniteInRange(value.severity, 0, 1) ||
    !isFiniteInRange(value.recency, 0, 1) ||
    !(value.confidence === null || isFiniteInRange(value.confidence, 0, 1)) ||
    !isFiniteInRange(value.geographicRelevance, 0, 1) ||
    (value.reportCategory !== undefined &&
      !['HARASSMENT', 'UNSAFE_AREA', 'POOR_LIGHTING', 'SUSPICIOUS_ACTIVITY', 'OTHER'].includes(
        String(value.reportCategory),
      )) ||
    (value.reportedSeverity !== undefined &&
      !['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(
        String(value.reportedSeverity),
      )) ||
    (value.routeId !== undefined && typeof value.routeId !== 'string') ||
    (value.segmentId !== undefined && typeof value.segmentId !== 'string') ||
    (value.reviewAnalysis !== undefined &&
      !parseReviewAnalysis(value.reviewAnalysis))
  ) {
    return undefined;
  }

  return {
    id: value.id,
    category: value.category as SafetyCategory,
    sourceReference: value.sourceReference,
    description: value.description,
    observedAt: value.observedAt,
    collectedAt: value.collectedAt,
    severity: value.severity,
    recency: value.recency,
    confidence: value.confidence,
    geographicRelevance: value.geographicRelevance,
    reportCategory: value.reportCategory as string | undefined,
    reportedSeverity: value.reportedSeverity as ReportSeverity | undefined,
    routeId: value.routeId as string | undefined,
    segmentId: value.segmentId as string | undefined,
    reviewAnalysis:
      value.reviewAnalysis === undefined
        ? undefined
        : parseReviewAnalysis(value.reviewAnalysis),
  };
}

function parseReviewAnalysis(
  value: unknown,
): SafetyEvidenceRecord['reviewAnalysis'] | undefined {
  if (
    !isRecord(value) ||
    !['POSITIVE', 'NEUTRAL', 'NEGATIVE', 'UNCERTAIN'].includes(
      String(value.sentimentLabel),
    ) ||
    !isFiniteInRange(value.sentimentScore, -1, 1) ||
    typeof value.safetyRelevant !== 'boolean' ||
    !isFiniteInRange(value.sentimentConfidence, 0, 1) ||
    !isFiniteInRange(value.safetyRelevanceConfidence, 0, 1) ||
    typeof value.modelName !== 'string' ||
    typeof value.modelVersion !== 'string' ||
    typeof value.analyzedAt !== 'string'
  ) {
    return undefined;
  }

  return {
    sentimentLabel: value.sentimentLabel as
      | 'POSITIVE'
      | 'NEUTRAL'
      | 'NEGATIVE'
      | 'UNCERTAIN',
    sentimentScore: value.sentimentScore,
    safetyRelevant: value.safetyRelevant,
    sentimentConfidence: value.sentimentConfidence,
    safetyRelevanceConfidence: value.safetyRelevanceConfidence,
    modelName: value.modelName,
    modelVersion: value.modelVersion,
    analyzedAt: value.analyzedAt,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

function isIntegerInRange(value: unknown, min: number, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    isFiniteInRange(value, min, max)
  );
}
