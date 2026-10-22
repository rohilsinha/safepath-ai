import { getAccessToken } from './session';

const apiBaseUrl = (process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');
const authRequestTimeoutMs = 10_000;

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
}

export interface SignupResponse {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  accessToken: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface CurrentUserResponse {
  id: string;
  name: string;
  email: string;
}

export interface RouteCoordinate {
  latitude: number;
  longitude: number;
}

export interface DestinationSearchResult extends RouteCoordinate {
  id: string;
  name: string;
  fullAddress: string;
}

export type GeoJSONPosition = [longitude: number, latitude: number];

export interface RouteGeometry {
  type: 'LineString';
  coordinates: GeoJSONPosition[];
}

export interface RouteAlternative {
  id: string;
  index: number;
  safetyRank: number | null;
  distanceMeters: number;
  durationSeconds: number;
  geometry: RouteGeometry;
  safetyAssessment: SafetyAssessment;
}

export type SafetyCategory =
  | 'crime_history'
  | 'recent_incidents_news'
  | 'community_reports'
  | 'environmental_factors'
  | 'crowd_activity';

export type SafetyRiskLevel =
  | 'low'
  | 'moderate'
  | 'high'
  | 'very_high'
  | 'insufficient_data';

export type SafetyAssessmentStatus =
  | 'complete'
  | 'insufficient_data'
  | 'unavailable';

export interface SafetyCategoryRisk {
  riskValue: number | null;
  available: boolean;
  weight: number | null;
}

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
  reportCategory?: CommunityReportCategory;
  reportedSeverity?: CommunityReportSeverity;
  routeId?: string;
  segmentId?: string;
  reviewAnalysis?: {
    sentimentLabel: ReviewSentimentLabel;
    sentimentScore: number;
    safetyRelevant: boolean;
    sentimentConfidence: number;
    safetyRelevanceConfidence: number;
    modelName: string;
    modelVersion: string;
    analyzedAt: string;
  };
}

export type CommunityReportCategory =
  | 'HARASSMENT'
  | 'UNSAFE_AREA'
  | 'POOR_LIGHTING'
  | 'SUSPICIOUS_ACTIVITY'
  | 'OTHER';

export type CommunityReportSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type ReviewAnalysisStatus = 'PENDING' | 'COMPLETED' | 'FAILED';
export type ReviewSentimentLabel = 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL' | 'UNCERTAIN';

export interface CommunityReviewAnalysisResponse {
  status: ReviewAnalysisStatus;
  sentimentLabel: ReviewSentimentLabel | null;
  sentimentScore: number | null;
  safetyRelevant: boolean | null;
  sentimentConfidence: number | null;
  safetyRelevanceConfidence: number | null;
  modelName: string;
  modelVersion: string;
  createdAt: string;
}

export interface CommunityReportRequest extends RouteCoordinate {
  description: string;
  category: CommunityReportCategory;
  severity: CommunityReportSeverity;
  occurredAt: string;
}

export interface CommunityReportResponse extends RouteCoordinate {
  id: string;
  description: string;
  category: CommunityReportCategory;
  severity: CommunityReportSeverity;
  occurredAt: string | null;
  status: 'ACCEPTED' | 'APPROVED' | 'REJECTED' | 'FLAGGED';
  createdAt: string;
  reviewAnalysis: CommunityReviewAnalysisResponse | null;
}

export interface SafetyAssessment {
  routeId: string;
  score: number | null;
  riskLevel: SafetyRiskLevel;
  status: SafetyAssessmentStatus;
  dataCoverage: number;
  categoryRisks: Record<SafetyCategory, SafetyCategoryRisk>;
  weightsUsed: Partial<Record<SafetyCategory, number>>;
  evidence: SafetyEvidenceRecord[];
  demoEvidence: DemoSafetyEvidenceRecord[];
  isDemo: boolean;
  policyVersion: string;
  explanationContext: Record<string, unknown>;
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

export interface RouteSearchResponse {
  origin: RouteCoordinate;
  destination: RouteCoordinate;
  routes: RouteAlternative[];
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class AuthRequestError extends Error {
  constructor(
    public readonly reason: 'timeout' | 'network',
    message: string,
  ) {
    super(message);
    this.name = 'AuthRequestError';
  }
}

function isLoginResponse(value: unknown): value is LoginResponse {
  if (typeof value !== 'object' || value === null || !('user' in value)) {
    return false;
  }

  const user = value.user;
  return (
    'accessToken' in value &&
    typeof value.accessToken === 'string' &&
    value.accessToken.length > 0 &&
    typeof user === 'object' &&
    user !== null &&
    'id' in user &&
    typeof user.id === 'string' &&
    'name' in user &&
    typeof user.name === 'string' &&
    'email' in user &&
    typeof user.email === 'string'
  );
}

function isSignupResponse(value: unknown): value is SignupResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    typeof value.id === 'string' &&
    'name' in value &&
    typeof value.name === 'string' &&
    'email' in value &&
    typeof value.email === 'string' &&
    'createdAt' in value &&
    typeof value.createdAt === 'string'
  );
}

export async function signup(data: SignupRequest): Promise<SignupResponse> {
  let response: Response;
  let responseBody: unknown;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    response = await fetch(`${apiBaseUrl}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }
  } catch {
    if (controller.signal.aborted) {
      console.warn('[auth] Signup request failed: timeout');
      throw new AuthRequestError(
        'timeout',
        'Sign-up timed out. Check that the SafePath API is running and try again.',
      );
    }

    console.warn('[auth] Signup request failed: network');
    throw new AuthRequestError(
      'network',
      'Unable to connect to SafePath. Check your connection and API address, then try again.',
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.warn('[auth] POST /auth/signup failed', { status: response.status });
    const errorBody =
      typeof responseBody === 'object' && responseBody !== null
        ? (responseBody as { message?: unknown })
        : undefined;
    const backendMessage = errorBody?.message;
    const message =
      response.status >= 500
        ? 'The service could not create your account right now. Please try again later.'
        : Array.isArray(backendMessage)
          ? backendMessage
              .filter((part): part is string => typeof part === 'string')
              .join(', ')
          : typeof backendMessage === 'string'
            ? backendMessage
            : 'Unable to create your account. Check your details and try again.';
    throw new ApiError(response.status, message);
  }

  if (!isSignupResponse(responseBody)) {
    console.warn('[auth] Signup returned an invalid success response');
    throw new Error('The server returned an unexpected sign-up response. Please try again.');
  }

  return responseBody;
}

export async function login(data: LoginRequest): Promise<LoginResponse> {
  let response: Response;
  let responseBody: unknown;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    response = await fetch(`${apiBaseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: controller.signal,
    });
    try {
      responseBody = await response.json();
    } catch {
      responseBody = undefined;
    }
  } catch {
    if (controller.signal.aborted) {
      throw new Error(
        'Sign-in timed out. Check that the SafePath API is running and try again.',
      );
    }

    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    console.warn('[auth] POST /auth/login failed', { status: response.status });
    const errorBody = responseBody as { message?: string | string[] } | undefined;
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : errorBody?.message ?? 'Unable to sign in. Please try again.';
    throw new ApiError(response.status, message);
  }

  if (!isLoginResponse(responseBody)) {
    throw new Error('Sign-in returned an invalid authentication response.');
  }

  return responseBody;
}

export async function getCurrentUser(
  accessToken: string,
): Promise<CurrentUserResponse> {
  let response: Response;
  let responseBody: { message?: string | string[] } | CurrentUserResponse | undefined;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), authRequestTimeoutMs);

  try {
    response = await fetch(`${apiBaseUrl}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    });
    try {
      responseBody = (await response.json()) as
        | { message?: string | string[] }
        | CurrentUserResponse;
    } catch {
      responseBody = undefined;
    }
  } catch {
    if (controller.signal.aborted) {
      throw new Error(
        'Session restoration timed out. Check that the SafePath API is running and try again.',
      );
    }

    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const errorBody = responseBody as { message?: string | string[] } | undefined;
    const message = Array.isArray(errorBody?.message)
      ? errorBody.message.join(', ')
      : errorBody?.message ?? 'Unable to restore your session. Please sign in again.';
    throw new ApiError(response.status, message);
  }

  return responseBody as CurrentUserResponse;
}

export async function searchDestinations(
  query: string,
  proximity?: RouteCoordinate,
): Promise<DestinationSearchResult[]> {
  let response: Response;

  try {
    const searchParams = new URLSearchParams({ query });
    if (proximity) {
      searchParams.set('proximityLatitude', String(proximity.latitude));
      searchParams.set('proximityLongitude', String(proximity.longitude));
    }
    response = await fetch(`${apiBaseUrl}/maps/search?${searchParams}`);
  } catch {
    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  }

  const responseBody = await readApiResponse(response);
  if (!response.ok) {
    throw toApiError(response.status, responseBody, 'Unable to search destinations.');
  }

  if (!Array.isArray(responseBody)) {
    throw new Error('The destination search returned an unexpected response.');
  }

  if (!responseBody.every(isDestinationSearchResult)) {
    throw new Error('The destination search returned invalid place data.');
  }

  return responseBody;
}

export async function calculateRoutes(
  origin: RouteCoordinate,
  destination: RouteCoordinate,
): Promise<RouteSearchResponse> {
  let response: Response;

  try {
    response = await fetch(`${apiBaseUrl}/maps/routes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination }),
    });
  } catch {
    throw new Error('Unable to connect to SafePath. Check your connection and try again.');
  }

  const responseBody = await readApiResponse(response);
  if (!response.ok) {
    throw toApiError(response.status, responseBody, 'Unable to calculate routes.');
  }

  if (!isRouteSearchResponse(responseBody)) {
    throw new Error('Route planning returned an unexpected response.');
  }

  return responseBody;
}

export async function submitCommunityReport(
    data: CommunityReportRequest,
  ): Promise<CommunityReportResponse> {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, 'Sign in to submit a safety report.');

    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/safety-reports`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });
    } catch {
      throw new Error('Unable to connect to SafePath. Check your connection and try again.');
    }
    const body = await readApiResponse(response);
    if (!response.ok) {
      throw toApiError(response.status, body, 'Unable to submit this report.');
    }
    if (!isCommunityReportResponse(body)) {
      throw new Error('The report submission returned an unexpected response.');
    }
    return body;
  }

export async function listCommunityReports(
    bounds: {
      minLatitude: number;
      maxLatitude: number;
      minLongitude: number;
      maxLongitude: number;
      occurredAfter?: string;
      occurredBefore?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<{ items: CommunityReportResponse[]; limit: number; offset: number; hasMore: boolean }> {
    const token = await getAccessToken();
    if (!token) throw new ApiError(401, 'Sign in to view community reports.');
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(bounds)) {
      if (value !== undefined) params.set(key, String(value));
    }
    return fetchCommunityReports(params, token);
  }

    export async function listMyCommunityReports(): Promise<CommunityReportResponse[]> {
      const token = await getAccessToken();
      if (!token) throw new ApiError(401, 'Sign in to view your reports.');
      let response: Response;
      try {
        response = await fetch(`${apiBaseUrl}/safety-reports/mine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch {
        throw new Error('Unable to connect to SafePath. Check your connection and try again.');
      }
      const body = await readApiResponse(response);
      if (!response.ok) {
        throw toApiError(response.status, body, 'Unable to load your reports.');
      }
      if (!Array.isArray(body) || !body.every(isCommunityReportResponse)) {
        throw new Error('Your reports returned an unexpected response.');
      }
      return body;
    }

    export async function deleteCommunityReport(id: string): Promise<void> {
      const token = await getAccessToken();
      if (!token) throw new ApiError(401, 'Sign in to delete your report.');
      let response: Response;
      try {
        response = await fetch(
          `${apiBaseUrl}/safety-reports/${encodeURIComponent(id)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
          },
        );
      } catch {
        throw new Error('Unable to connect to SafePath. Check your connection and try again.');
      }
      if (!response.ok) {
        const body = await readApiResponse(response);
        throw toApiError(response.status, body, 'Unable to delete this report.');
      }
    }
    async function fetchCommunityReports(
      params: URLSearchParams,
      token: string,
    ): Promise<{
      items: CommunityReportResponse[];
      limit: number;
      offset: number;
      hasMore: boolean;
    }> {
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/safety-reports?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      throw new Error('Unable to connect to SafePath. Check your connection and try again.');
    }
    const body = await readApiResponse(response);
    if (!response.ok) {
      throw toApiError(response.status, body, 'Unable to load community reports.');
    }
    if (!isCommunityReportList(body)) {
      throw new Error('The community reports returned an unexpected response.');
    }
    return body;
  }

async function readApiResponse(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function toApiError(
  status: number,
  responseBody: unknown,
  fallbackMessage: string,
): ApiError {
  const message =
    typeof responseBody === 'object' &&
    responseBody !== null &&
    'message' in responseBody
      ? responseBody.message
      : undefined;
  const errorMessage = Array.isArray(message)
    ? message.filter((part): part is string => typeof part === 'string').join(', ')
    : typeof message === 'string'
      ? message
      : fallbackMessage;

  return new ApiError(status, errorMessage);
}

function isDestinationSearchResult(value: unknown): value is DestinationSearchResult {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const result = value as Record<string, unknown>;
  return (
    typeof result.id === 'string' &&
    typeof result.name === 'string' &&
    typeof result.fullAddress === 'string' &&
    isCoordinate(result)
  );
}

function isCoordinate(value: Record<string, unknown>): boolean {
  return (
    typeof value.latitude === 'number' &&
    Number.isFinite(value.latitude) &&
    value.latitude >= -90 &&
    value.latitude <= 90 &&
    typeof value.longitude === 'number' &&
    Number.isFinite(value.longitude) &&
    value.longitude >= -180 &&
    value.longitude <= 180
  );
}

function isRouteSearchResponse(value: unknown): value is RouteSearchResponse {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const response = value as Record<string, unknown>;
  if (
    typeof response.origin !== 'object' ||
    response.origin === null ||
    typeof response.destination !== 'object' ||
    response.destination === null ||
    !Array.isArray(response.routes) ||
    !isCoordinate(response.origin as Record<string, unknown>) ||
    !isCoordinate(response.destination as Record<string, unknown>)
  ) {
    return false;
  }

  return response.routes.every((route: unknown) => {
    if (typeof route !== 'object' || route === null) {
      return false;
    }

    const item = route as Record<string, unknown>;
    if (
      typeof item.id !== 'string' ||
      typeof item.index !== 'number' ||
      !(item.safetyRank === null ||
        (typeof item.safetyRank === 'number' &&
          Number.isInteger(item.safetyRank) &&
          item.safetyRank > 0)) ||
      typeof item.distanceMeters !== 'number' ||
      !Number.isFinite(item.distanceMeters) ||
      typeof item.durationSeconds !== 'number' ||
      !Number.isFinite(item.durationSeconds) ||
      typeof item.geometry !== 'object' ||
      item.geometry === null ||
      !isSafetyAssessment(item.safetyAssessment, item.id)
    ) {
      return false;
    }

    const geometry = item.geometry as Record<string, unknown>;
    return (
      geometry.type === 'LineString' &&
      Array.isArray(geometry.coordinates) &&
      geometry.coordinates.every(
        (coordinate: unknown) =>
          Array.isArray(coordinate) &&
          coordinate.length === 2 &&
          typeof coordinate[0] === 'number' &&
          Number.isFinite(coordinate[0]) &&
          typeof coordinate[1] === 'number' &&
          Number.isFinite(coordinate[1]),
      )
    );
  });
}

function isSafetyAssessment(value: unknown, routeId: string): value is SafetyAssessment {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const assessment = value as Record<string, unknown>;
  const categories: SafetyCategory[] = [
    'crime_history',
    'recent_incidents_news',
    'community_reports',
    'environmental_factors',
    'crowd_activity',
  ];
  if (
    assessment.routeId !== routeId ||
    !['complete', 'insufficient_data', 'unavailable'].includes(
      String(assessment.status),
    ) ||
    !['low', 'moderate', 'high', 'very_high', 'insufficient_data'].includes(
      String(assessment.riskLevel),
    ) ||
    !(assessment.score === null || isFiniteNumberInRange(assessment.score, 0, 100)) ||
    !isFiniteNumberInRange(assessment.dataCoverage, 0, 1) ||
    typeof assessment.policyVersion !== 'string' ||
    typeof assessment.categoryRisks !== 'object' ||
    assessment.categoryRisks === null ||
    typeof assessment.weightsUsed !== 'object' ||
    assessment.weightsUsed === null ||
    !Array.isArray(assessment.evidence) ||
    !Array.isArray(assessment.demoEvidence) ||
    typeof assessment.isDemo !== 'boolean' ||
    typeof assessment.explanationContext !== 'object' ||
    assessment.explanationContext === null
  ) {
    return false;
  }

  const categoryRisks = assessment.categoryRisks as Record<string, unknown>;
  if (!categories.every((category) => {
    const risk = categoryRisks[category];
    if (typeof risk !== 'object' || risk === null) {
      return false;
    }
    const categoryRisk = risk as Record<string, unknown>;
    return (
      (categoryRisk.riskValue === null ||
        isFiniteNumberInRange(categoryRisk.riskValue, 0, 100)) &&
      typeof categoryRisk.available === 'boolean' &&
      categoryRisk.available === (categoryRisk.riskValue !== null) &&
      (categoryRisk.weight === null ||
        isFiniteNumberInRange(categoryRisk.weight, 0, 1))
    );
  })) {
    return false;
  }
  const weightsUsed = assessment.weightsUsed as Record<string, unknown>;
  if (
    Object.entries(weightsUsed).some(
      ([category, weight]) =>
        !categories.includes(category as SafetyCategory) ||
        !isFiniteNumberInRange(weight, 0, 1),
    ) ||
    !assessment.evidence.every(isSafetyEvidence) ||
    !assessment.demoEvidence.every(isDemoSafetyEvidence)
  ) {
    return false;
  }

  if (
    (assessment.status === 'complete' &&
      (assessment.score === null || assessment.riskLevel === 'insufficient_data')) ||
    ((assessment.status === 'insufficient_data' ||
      assessment.status === 'unavailable') &&
      (assessment.score !== null || assessment.riskLevel !== 'insufficient_data'))
  ) {
    return false;
  }
  if (
    (assessment.isDemo &&
      (assessment.status !== 'complete' || assessment.demoEvidence.length === 0)) ||
    (!assessment.isDemo && assessment.score !== null && assessment.demoEvidence.length > 0)
  ) {
    return false;
  }

  return true;
}

function isDemoSafetyEvidence(
  value: unknown,
): value is DemoSafetyEvidenceRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const evidence = value as Record<string, unknown>;
  return (
    typeof evidence.id === 'string' &&
    [
      'crime_history',
      'recent_incidents_news',
      'environmental_factors',
      'crowd_activity',
    ].includes(String(evidence.category)) &&
    evidence.sourceReference === 'synthetic_demo_v1' &&
    typeof evidence.description === 'string' &&
    typeof evidence.longitude === 'number' &&
    Number.isFinite(evidence.longitude) &&
    evidence.longitude >= -180 &&
    evidence.longitude <= 180 &&
    typeof evidence.latitude === 'number' &&
    Number.isFinite(evidence.latitude) &&
    evidence.latitude >= -90 &&
    evidence.latitude <= 90 &&
    typeof evidence.observedAt === 'string' &&
    typeof evidence.collectedAt === 'string' &&
    isFiniteNumberInRange(evidence.riskValue, 0, 100) &&
    evidence.isDemo === true &&
    isFiniteNumberInRange(evidence.geographicRelevance, 0, 1) &&
    typeof evidence.distanceMeters === 'number' &&
    Number.isFinite(evidence.distanceMeters) &&
    evidence.distanceMeters >= 0 &&
    typeof evidence.routeId === 'string' &&
    typeof evidence.segmentId === 'string'
  );
}

function isSafetyEvidence(value: unknown): value is SafetyEvidenceRecord {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const evidence = value as Record<string, unknown>;
  return (
    typeof evidence.id === 'string' &&
    [
      'crime_history',
      'recent_incidents_news',
      'community_reports',
      'environmental_factors',
      'crowd_activity',
    ].includes(String(evidence.category)) &&
    typeof evidence.sourceReference === 'string' &&
    typeof evidence.description === 'string' &&
    typeof evidence.observedAt === 'string' &&
    typeof evidence.collectedAt === 'string' &&
    isFiniteNumberInRange(evidence.severity, 0, 1) &&
    isFiniteNumberInRange(evidence.recency, 0, 1) &&
    (evidence.confidence === null ||
      isFiniteNumberInRange(evidence.confidence, 0, 1)) &&
    isFiniteNumberInRange(evidence.geographicRelevance, 0, 1) &&
    (evidence.reportCategory === undefined ||
      ['HARASSMENT', 'UNSAFE_AREA', 'POOR_LIGHTING', 'SUSPICIOUS_ACTIVITY', 'OTHER'].includes(
        String(evidence.reportCategory),
      )) &&
    (evidence.reportedSeverity === undefined ||
      ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(
        String(evidence.reportedSeverity),
      )) &&
    (evidence.routeId === undefined || typeof evidence.routeId === 'string') &&
    (evidence.segmentId === undefined || typeof evidence.segmentId === 'string') &&
    (evidence.reviewAnalysis === undefined ||
      isRouteReviewAnalysis(evidence.reviewAnalysis))
  );
}

function isRouteReviewAnalysis(
  value: unknown,
): value is NonNullable<SafetyEvidenceRecord['reviewAnalysis']> {
  if (typeof value !== 'object' || value === null) return false;
  const analysis = value as Record<string, unknown>;
  return (
    ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNCERTAIN'].includes(
      String(analysis.sentimentLabel),
    ) &&
    isFiniteNumberInRange(analysis.sentimentScore, -1, 1) &&
    typeof analysis.safetyRelevant === 'boolean' &&
    isFiniteNumberInRange(analysis.sentimentConfidence, 0, 1) &&
    isFiniteNumberInRange(analysis.safetyRelevanceConfidence, 0, 1) &&
    typeof analysis.modelName === 'string' &&
    typeof analysis.modelVersion === 'string' &&
    typeof analysis.analyzedAt === 'string'
  );
}

function isCommunityReportResponse(value: unknown): value is CommunityReportResponse {
  if (typeof value !== 'object' || value === null) return false;
  const report = value as Record<string, unknown>;
  return (
    typeof report.id === 'string' &&
    typeof report.description === 'string' &&
    typeof report.category === 'string' &&
    ['HARASSMENT', 'UNSAFE_AREA', 'POOR_LIGHTING', 'SUSPICIOUS_ACTIVITY', 'OTHER'].includes(String(report.category)) &&
    ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(report.severity)) &&
    ['ACCEPTED', 'APPROVED', 'REJECTED', 'FLAGGED'].includes(String(report.status)) &&
    (report.occurredAt === null || typeof report.occurredAt === 'string') &&
    typeof report.createdAt === 'string' &&
    (report.reviewAnalysis === null || isCommunityReviewAnalysisResponse(report.reviewAnalysis)) &&
    isCoordinate(report)
  );
}

function isCommunityReviewAnalysisResponse(
  value: unknown,
): value is CommunityReviewAnalysisResponse {
  if (typeof value !== 'object' || value === null) return false;
  const analysis = value as Record<string, unknown>;
  return (
    ['PENDING', 'COMPLETED', 'FAILED'].includes(String(analysis.status)) &&
    (analysis.sentimentLabel === null ||
      ['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'UNCERTAIN'].includes(
        String(analysis.sentimentLabel),
      )) &&
    (analysis.sentimentScore === null ||
      isFiniteNumberInRange(analysis.sentimentScore, -1, 1)) &&
    (analysis.safetyRelevant === null ||
      typeof analysis.safetyRelevant === 'boolean') &&
    (analysis.sentimentConfidence === null ||
      isFiniteNumberInRange(analysis.sentimentConfidence, 0, 1)) &&
    (analysis.safetyRelevanceConfidence === null ||
      isFiniteNumberInRange(analysis.safetyRelevanceConfidence, 0, 1)) &&
    typeof analysis.modelName === 'string' &&
    typeof analysis.modelVersion === 'string' &&
    typeof analysis.createdAt === 'string'
  );
}

function isCommunityReportList(value: unknown): value is {
  items: CommunityReportResponse[];
  limit: number;
  offset: number;
  hasMore: boolean;
} {
  if (typeof value !== 'object' || value === null) return false;
  const page = value as Record<string, unknown>;
  return (
    Array.isArray(page.items) &&
    page.items.every(isCommunityReportResponse) &&
    typeof page.limit === 'number' &&
    Number.isInteger(page.limit) &&
    typeof page.offset === 'number' &&
    Number.isInteger(page.offset) &&
    typeof page.hasMore === 'boolean'
  );
}

function isFiniteNumberInRange(
  value: unknown,
  minimum: number,
  maximum: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}
