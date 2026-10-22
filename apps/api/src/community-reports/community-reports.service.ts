import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  ReportSeverity,
  ReviewAnalysisStatus,
  ReviewSentimentLabel,
  SafetyReportCategory,
  SafetyReportStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { SafetyEvidenceRecord } from '../maps/safety-scoring.service';
import { hashReviewText, ReviewAnalysisService } from './review-analysis.service';
import {
  CommunityReportAreaQueryDto,
  CreateCommunityReportDto,
} from './dto/community-report.dto';

const EARTH_RADIUS_METERS = 6_371_000;
const DEFAULT_PROXIMITY_METERS = 100;
const DEFAULT_RECENCY_DAYS = 30;
const MAX_RECENCY_DAYS = 365;
const MAX_ROUTE_CANDIDATES = 500;
const MAX_AREA_DEGREES = 2;
const MAX_DESCRIPTION_LENGTH = 500;
const DUPLICATE_DISTANCE_METERS = 50;
const DUPLICATE_TIME_WINDOW_MS = 24 * 60 * 60 * 1000;
const latestReviewAnalysisSelect = {
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 1,
  select: {
    status: true,
    sentimentLabel: true,
    sentimentScore: true,
    safetyRelevant: true,
    sentimentConfidence: true,
    safetyRelevanceConfidence: true,
    modelName: true,
    modelVersion: true,
    createdAt: true,
  },
} satisfies Prisma.ReviewAnalysisFindManyArgs;

interface RouteGeometryInput {
  id: string;
  coordinates: [number, number][];
}

interface StoredReport {
  id: string;
  latitude: number;
  longitude: number;
  description: string;
  category: SafetyReportCategory;
  severity: ReportSeverity;
  occurredAt: Date | null;
  createdAt: Date;
  reviewAnalyses?: StoredReviewAnalysis[];
}

interface StoredReviewAnalysis {
  status: ReviewAnalysisStatus;
  textHash: string;
  sentimentLabel: ReviewSentimentLabel | null;
  sentimentScore: number | null;
  safetyRelevant: boolean | null;
  sentimentConfidence: number | null;
  safetyRelevanceConfidence: number | null;
  modelName: string;
  modelVersion: string;
  createdAt: Date;
}

export interface CommunityReviewAnalysisResponse {
  status: ReviewAnalysisStatus;
  sentimentLabel: ReviewSentimentLabel | null;
  sentimentScore: number | null;
  safetyRelevant: boolean | null;
  sentimentConfidence: number | null;
  safetyRelevanceConfidence: number | null;
  modelName: string;
  modelVersion: string;
  createdAt: Date;
}

export interface CommunityReportResponse {
  id: string;
  latitude: number;
  longitude: number;
  description: string;
  category: SafetyReportCategory;
  severity: ReportSeverity;
  occurredAt: Date | null;
  status: SafetyReportStatus;
  createdAt: Date;
  reviewAnalysis: CommunityReviewAnalysisResponse | null;
}

@Injectable()
export class CommunityReportsService {
  private readonly logger = new Logger(CommunityReportsService.name);
  private readonly proximityMeters: number;
  private readonly recencyDays: number;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
    private readonly reviewAnalysisService: ReviewAnalysisService,
  ) {
    this.proximityMeters = readPositiveConfig(
      configService,
      'COMMUNITY_REPORT_PROXIMITY_METERS',
      DEFAULT_PROXIMITY_METERS,
      1_000,
    );
    this.recencyDays = readPositiveConfig(
      configService,
      'COMMUNITY_REPORT_RECENCY_DAYS',
      DEFAULT_RECENCY_DAYS,
      MAX_RECENCY_DAYS,
    );
  }

  async create(
    reporterId: string,
    input: CreateCommunityReportDto,
  ): Promise<CommunityReportResponse> {
    const occurredAt = new Date(input.occurredAt);
    const now = Date.now();
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() > now + 5 * 60 * 1000 ||
      occurredAt.getTime() < now - 365 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'Incident time must be within the past 365 days and not in the future.',
      );
    }

    const normalizedDescription = input.description.trim().slice(
      0,
      MAX_DESCRIPTION_LENGTH,
    );
    const duplicate = await this.prisma.safetyReport.findFirst({
      where: {
        userId: reporterId,
        deletedAt: null,
        category: input.category,
        severity: input.severity,
        description: normalizedDescription,
        occurredAt: {
          gte: new Date(occurredAt.getTime() - 60_000),
          lte: new Date(occurredAt.getTime() + 60_000),
        },
        latitude: { gte: input.latitude - 0.0003, lte: input.latitude + 0.0003 },
        longitude: { gte: input.longitude - 0.0003, lte: input.longitude + 0.0003 },
      },
      select: { id: true },
    });
    if (duplicate) {
      const existing = await this.findVisibleReport(duplicate.id, reporterId);
      await this.analyzeWithoutBlockingSubmission(existing);
      return this.findVisibleReport(duplicate.id, reporterId);
    }

    const report = await this.prisma.safetyReport.create({
      data: {
        userId: reporterId,
        latitude: input.latitude,
        longitude: input.longitude,
        description: normalizedDescription,
        category: input.category,
        severity: input.severity,
        occurredAt,
        status: SafetyReportStatus.ACCEPTED,
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        description: true,
        category: true,
        severity: true,
        occurredAt: true,
        status: true,
        createdAt: true,
      },
    });

    await this.analyzeWithoutBlockingSubmission(report);
    return this.findVisibleReport(report.id, reporterId);
  }

  async listAccepted(
    query: CommunityReportAreaQueryDto,
  ): Promise<{
    items: CommunityReportResponse[];
    limit: number;
    offset: number;
    hasMore: boolean;
  }> {
    this.validateAreaAndDates(query);

    const now = new Date();
    const defaultStart = new Date(
      now.getTime() - this.recencyDays * 24 * 60 * 60 * 1000,
    );
    const occurredAfter = query.occurredAfter
      ? new Date(query.occurredAfter)
      : defaultStart;
    const occurredBefore = query.occurredBefore
      ? new Date(query.occurredBefore)
      : now;

    const reports = await this.prisma.safetyReport.findMany({
      where: {
        status: { in: [SafetyReportStatus.ACCEPTED, SafetyReportStatus.APPROVED] },
        deletedAt: null,
        occurredAt: { gte: occurredAfter, lte: occurredBefore },
        latitude: { gte: query.minLatitude, lte: query.maxLatitude },
        longitude: { gte: query.minLongitude, lte: query.maxLongitude },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
      skip: query.offset,
      take: query.limit + 1,
      select: {
        id: true,
        latitude: true,
        longitude: true,
        description: true,
        category: true,
        severity: true,
        occurredAt: true,
        status: true,
        createdAt: true,
        reviewAnalyses: latestReviewAnalysisSelect,
      },
    });

    return {
      items: reports.slice(0, query.limit).map(({ reviewAnalyses, ...report }) => ({
        ...report,
        reviewAnalysis: toReviewAnalysisResponse(reviewAnalyses[0]),
      })),
      limit: query.limit,
      offset: query.offset,
      hasMore: reports.length > query.limit,
    };
  }

  async findVisibleReport(
    id: string,
    requesterId: string,
  ): Promise<CommunityReportResponse> {
    const report = await this.prisma.safetyReport.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        latitude: true,
        longitude: true,
        description: true,
        category: true,
        severity: true,
        occurredAt: true,
        status: true,
        createdAt: true,
        deletedAt: true,
        reviewAnalyses: latestReviewAnalysisSelect,
      },
    });

    if (
      !report ||
      Boolean(report.deletedAt) ||
      (report.status !== SafetyReportStatus.ACCEPTED &&
        report.status !== SafetyReportStatus.APPROVED &&
        report.userId !== requesterId)
    ) {
      throw new NotFoundException('Safety report not found');
    }

    const {
      userId: _userId,
      deletedAt: _deletedAt,
      reviewAnalyses,
      ...visibleReport
    } = report;
    return {
      ...visibleReport,
      reviewAnalysis: toReviewAnalysisResponse(reviewAnalyses[0]),
    };
  }

  async listMine(
    reporterId: string,
  ): Promise<CommunityReportResponse[]> {
    return this.prisma.safetyReport.findMany({
      where: { userId: reporterId, deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        latitude: true,
        longitude: true,
        description: true,
        category: true,
        severity: true,
        occurredAt: true,
        status: true,
        createdAt: true,
        reviewAnalyses: latestReviewAnalysisSelect,
      },
    }).then((reports) =>
      reports.map(({ reviewAnalyses, ...report }) => ({
        ...report,
        reviewAnalysis: toReviewAnalysisResponse(reviewAnalyses[0]),
      })),
    );
  }

  async deleteOwnReport(id: string, reporterId: string): Promise<void> {
    const result = await this.prisma.safetyReport.updateMany({
      where: { id, userId: reporterId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    if (result.count === 0) {
      throw new NotFoundException('Safety report not found');
    }
  }

  async evidenceForRoutes(
    routes: RouteGeometryInput[],
  ): Promise<Record<string, SafetyEvidenceRecord[]>> {
    const evidenceByRoute: Record<string, SafetyEvidenceRecord[]> =
      Object.fromEntries(routes.map((route) => [route.id, []]));
    const allCoordinates = routes.flatMap((route) => route.coordinates);
    if (
      allCoordinates.length === 0 ||
      allCoordinates.some(
        ([longitude, latitude]) =>
          !Number.isFinite(longitude) ||
          longitude < -180 ||
          longitude > 180 ||
          !Number.isFinite(latitude) ||
          latitude < -90 ||
          latitude > 90,
      )
    ) {
      return evidenceByRoute;
    }

    const now = new Date();
    const recentStart = new Date(
      now.getTime() - this.recencyDays * 24 * 60 * 60 * 1000,
    );
    for (const route of routes) {
      if (route.coordinates.length === 0) continue;
      const bounds = expandedBounds(route.coordinates, this.proximityMeters);
      const reports = (await this.prisma.safetyReport.findMany({
        where: {
          status: { in: [SafetyReportStatus.ACCEPTED, SafetyReportStatus.APPROVED] },
          deletedAt: null,
          occurredAt: { gte: recentStart, lte: now },
          latitude: { gte: bounds.minLatitude, lte: bounds.maxLatitude },
          longitude: { gte: bounds.minLongitude, lte: bounds.maxLongitude },
        },
        orderBy: [{ occurredAt: 'desc' }, { id: 'asc' }],
        take: MAX_ROUTE_CANDIDATES,
        select: {
          id: true,
          latitude: true,
          longitude: true,
          category: true,
          severity: true,
          occurredAt: true,
          createdAt: true,
          description: true,
          reviewAnalyses: {
            where: { status: ReviewAnalysisStatus.COMPLETED },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: {
              textHash: true,
              sentimentLabel: true,
              sentimentScore: true,
              safetyRelevant: true,
              sentimentConfidence: true,
              safetyRelevanceConfidence: true,
              modelName: true,
              modelVersion: true,
              createdAt: true,
            },
          },
        },
      })) as StoredReport[];
      const matched = reports
        .filter(
          (report): report is StoredReport & { occurredAt: Date } =>
            report.occurredAt !== null &&
            isValidCoordinate(report.latitude, report.longitude),
        )
        .map((report) => ({
          report,
          match: closestPointOnRoute(
            { latitude: report.latitude, longitude: report.longitude },
            route.coordinates,
          ),
        }))
        .filter(({ match }) => match.distanceMeters <= this.proximityMeters)
        .sort(
          (left, right) =>
            right.report.occurredAt.getTime() -
            left.report.occurredAt.getTime(),
        );

      const independentReports: typeof matched = [];
      const seenReportIds = new Set<string>();
      for (const candidate of matched) {
        if (seenReportIds.has(candidate.report.id)) continue;
        seenReportIds.add(candidate.report.id);
        const duplicate = independentReports.some(
          ({ report }) =>
            report.category === candidate.report.category &&
            Math.abs(
              report.occurredAt.getTime() -
                candidate.report.occurredAt.getTime(),
            ) <=
              DUPLICATE_TIME_WINDOW_MS &&
            haversineMeters(
              { latitude: report.latitude, longitude: report.longitude },
              {
                latitude: candidate.report.latitude,
                longitude: candidate.report.longitude,
              },
            ) <=
              DUPLICATE_DISTANCE_METERS,
        );
        if (!duplicate) independentReports.push(candidate);
      }

      evidenceByRoute[route.id] = independentReports.slice(0, 100).map(
        ({ report, match }): SafetyEvidenceRecord => {
          const ageMs = Math.max(0, now.getTime() - report.occurredAt.getTime());
          const windowMs = this.recencyDays * 24 * 60 * 60 * 1000;
          const latestAnalysis = report.reviewAnalyses?.[0];
          const reviewAnalysis =
            latestAnalysis &&
            typeof report.description === 'string' &&
            latestAnalysis.textHash === hashReviewText(report.description) &&
            latestAnalysis.sentimentLabel !== null &&
            latestAnalysis.sentimentScore !== null &&
            latestAnalysis.safetyRelevant !== null &&
            latestAnalysis.sentimentConfidence !== null &&
            latestAnalysis.safetyRelevanceConfidence !== null
              ? {
                  sentimentLabel: latestAnalysis.sentimentLabel,
                  sentimentScore: latestAnalysis.sentimentScore,
                  safetyRelevant: latestAnalysis.safetyRelevant,
                  sentimentConfidence: latestAnalysis.sentimentConfidence,
                  safetyRelevanceConfidence:
                    latestAnalysis.safetyRelevanceConfidence,
                  modelName: latestAnalysis.modelName,
                  modelVersion: latestAnalysis.modelVersion,
                  analyzedAt: latestAnalysis.createdAt.toISOString(),
                }
              : undefined;
          return {
            id: report.id,
            category: 'community_reports',
            sourceReference: 'accepted_community_report',
            description:
              'User-submitted community information accepted for display; it is not a verified incident.',
            observedAt: report.occurredAt.toISOString(),
            collectedAt: report.createdAt.toISOString(),
            severity: severityValue(report.severity),
            recency: clamp01(1 - ageMs / windowMs),
            confidence: null,
            geographicRelevance: clamp01(
              1 - match.distanceMeters / this.proximityMeters,
            ),
            reportCategory: report.category,
            reportedSeverity: report.severity,
            routeId: route.id,
            segmentId: `segment-${match.segmentIndex + 1}`,
            ...(reviewAnalysis ? { reviewAnalysis } : {}),
          };
        },
      );
    }

    return evidenceByRoute;
  }

  private async analyzeWithoutBlockingSubmission(review: {
    id: string;
    description: string;
  }): Promise<void> {
    try {
      await this.reviewAnalysisService.analyzeIfNeeded(review);
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'UnknownError';
      this.logger.warn(
        `Review analysis failed for report ${review.id} (${reason}); the submitted report was preserved.`,
      );
    }
  }

  private validateAreaAndDates(query: CommunityReportAreaQueryDto): void {
    if (
      query.minLatitude >= query.maxLatitude ||
      query.minLongitude >= query.maxLongitude ||
      query.maxLatitude - query.minLatitude > MAX_AREA_DEGREES ||
      query.maxLongitude - query.minLongitude > MAX_AREA_DEGREES
    ) {
      throw new BadRequestException(
        'Geographic bounds must be ordered and cover no more than two degrees.',
      );
    }

    const now = Date.now();
    const earliestAllowed = now - 365 * 24 * 60 * 60 * 1000;
    const occurredAfter = query.occurredAfter
      ? Date.parse(query.occurredAfter)
      : now - this.recencyDays * 24 * 60 * 60 * 1000;
    const occurredBefore = query.occurredBefore
      ? Date.parse(query.occurredBefore)
      : now;
    if (
      occurredAfter > occurredBefore ||
      occurredBefore > now + 5 * 60 * 1000 ||
      occurredAfter < earliestAllowed ||
      occurredBefore - occurredAfter > 365 * 24 * 60 * 60 * 1000
    ) {
      throw new BadRequestException(
        'Report time filters must be ordered and within the past 365 days.',
      );
    }
  }
}

function readPositiveConfig(
  configService: ConfigService,
  key: string,
  fallback: number,
  maximum: number,
): number {
  const configured = configService.get<string>(key);
  if (configured === undefined || configured.trim() === '') return fallback;
  const value = Number(configured);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) {
    throw new Error(`${key} must be greater than zero and no more than ${maximum}.`);
  }
  return value;
}

function expandedBounds(
  coordinates: [number, number][],
  paddingMeters: number,
): {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
} {
  const latitudes = coordinates.map(([, latitude]) => latitude);
  const longitudes = coordinates.map(([longitude]) => longitude);
  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const latitudePadding = paddingMeters / 111_320;
  const latitudeForLongitude = Math.max(
    Math.abs(minLatitude),
    Math.abs(maxLatitude),
  );
  const longitudePadding =
    Math.cos((latitudeForLongitude * Math.PI) / 180) < 0.01
      ? 180
      : Math.min(
          180,
          paddingMeters /
            (111_320 *
              Math.cos((latitudeForLongitude * Math.PI) / 180)),
        );
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);
  const crossesAntimeridian = maxLongitude - minLongitude > 180;

  return {
    minLatitude: Math.max(-90, minLatitude - latitudePadding),
    maxLatitude: Math.min(90, maxLatitude + latitudePadding),
    minLongitude: crossesAntimeridian
      ? -180
      : Math.max(-180, minLongitude - longitudePadding),
    maxLongitude: crossesAntimeridian
      ? 180
      : Math.min(180, maxLongitude + longitudePadding),
  };
}

export function closestPointOnRoute(
  point: { latitude: number; longitude: number },
  coordinates: [number, number][],
): { distanceMeters: number; segmentIndex: number } {
  if (coordinates.length === 1) {
    return {
      distanceMeters: haversineMeters(point, {
        longitude: coordinates[0][0],
        latitude: coordinates[0][1],
      }),
      segmentIndex: 0,
    };
  }

  let closest = { distanceMeters: Number.POSITIVE_INFINITY, segmentIndex: 0 };
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const start = { longitude: coordinates[index][0], latitude: coordinates[index][1] };
    const end = { longitude: coordinates[index + 1][0], latitude: coordinates[index + 1][1] };
    const distanceMeters = pointToSegmentMeters(point, start, end);
    if (distanceMeters < closest.distanceMeters) {
      closest = { distanceMeters, segmentIndex: index };
    }
  }
  return closest;
}

function pointToSegmentMeters(
  point: { latitude: number; longitude: number },
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): number {
  const startToPoint = haversineMeters(start, point) / EARTH_RADIUS_METERS;
  const startToEnd = haversineMeters(start, end) / EARTH_RADIUS_METERS;
  if (startToEnd === 0) return startToPoint * EARTH_RADIUS_METERS;

  const pointBearing = bearingRadians(start, point);
  const segmentBearing = bearingRadians(start, end);
  const crossTrack =
    Math.asin(
      Math.sin(startToPoint) *
        Math.sin(pointBearing - segmentBearing),
    ) * EARTH_RADIUS_METERS;
  const alongTrack = Math.atan2(
    Math.sin(startToPoint) * Math.cos(pointBearing - segmentBearing),
    Math.cos(startToPoint),
  );
  if (alongTrack < 0 || alongTrack > startToEnd) {
    return Math.min(
      haversineMeters(point, start),
      haversineMeters(point, end),
    );
  }
  return Math.abs(crossTrack);
}

function bearingRadians(
  start: { latitude: number; longitude: number },
  end: { latitude: number; longitude: number },
): number {
  const startLatitude = (start.latitude * Math.PI) / 180;
  const endLatitude = (end.latitude * Math.PI) / 180;
  const longitudeDelta =
    ((end.longitude - start.longitude) * Math.PI) / 180;
  return Math.atan2(
    Math.sin(longitudeDelta) * Math.cos(endLatitude),
    Math.cos(startLatitude) * Math.sin(endLatitude) -
      Math.sin(startLatitude) *
        Math.cos(endLatitude) *
        Math.cos(longitudeDelta),
  );
}

function haversineMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number },
): number {
  const latitudeDelta =
    ((second.latitude - first.latitude) * Math.PI) / 180;
  const longitudeDelta =
    ((second.longitude - first.longitude) * Math.PI) / 180;
  const firstLatitude = (first.latitude * Math.PI) / 180;
  const secondLatitude = (second.latitude * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return (
    2 *
    EARTH_RADIUS_METERS *
    Math.asin(Math.sqrt(Math.min(1, haversine)))
  );
}

function severityValue(severity: ReportSeverity): number {
  switch (severity) {
    case ReportSeverity.LOW:
      return 0.25;
    case ReportSeverity.MEDIUM:
      return 0.5;
    case ReportSeverity.HIGH:
      return 0.75;
    case ReportSeverity.CRITICAL:
      return 1;
  }
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function toReviewAnalysisResponse(
  analysis:
    | Pick<
        StoredReviewAnalysis,
        | 'status'
        | 'sentimentLabel'
        | 'sentimentScore'
        | 'safetyRelevant'
        | 'sentimentConfidence'
        | 'safetyRelevanceConfidence'
        | 'modelName'
        | 'modelVersion'
        | 'createdAt'
      >
    | undefined,
): CommunityReviewAnalysisResponse | null {
  if (!analysis) return null;
  const {
    status,
    sentimentLabel,
    sentimentScore,
    safetyRelevant,
    sentimentConfidence,
    safetyRelevanceConfidence,
    modelName,
    modelVersion,
    createdAt,
  } = analysis;
  return {
    status,
    sentimentLabel,
    sentimentScore,
    safetyRelevant,
    sentimentConfidence,
    safetyRelevanceConfidence,
    modelName,
    modelVersion,
    createdAt,
  };
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    Number.isFinite(longitude) &&
    longitude >= -180 &&
    longitude <= 180
  );
}
