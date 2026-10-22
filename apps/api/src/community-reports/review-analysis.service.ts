import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ReviewAnalysisStatus,
  ReviewSentimentLabel,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export const REVIEW_ANALYSIS_MODEL_NAME = 'safepath-lexical';
export const REVIEW_ANALYSIS_MODEL_VERSION = '1.0.0';

const ANALYSIS_TIMEOUT_MS = 3_000;
const STALE_ANALYSIS_MS = 60_000;
const FAILED_RETRY_BACKOFF_MS = 30_000;

export interface ReviewAnalysisOutput {
  sentimentLabel: ReviewSentimentLabel;
  sentimentScore: number;
  safetyRelevant: boolean;
  sentimentConfidence: number;
  safetyRelevanceConfidence: number;
  modelName: string;
  modelVersion: string;
}

export function hashReviewText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

@Injectable()
export class ReviewAnalysisService {
  private readonly analysisUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    configService: ConfigService,
  ) {
    this.analysisUrl =
      configService.get<string>('SAFETY_ANALYSIS_URL')?.trim() ||
      'http://127.0.0.1:8001/analyze-review';
  }

  async analyzeIfNeeded(review: {
    id: string;
    description: string;
  }): Promise<void> {
    const textHash = hashReviewText(review.description);
    const uniqueKey = {
      safetyReportId_textHash_modelName_modelVersion: {
        safetyReportId: review.id,
        textHash,
        modelName: REVIEW_ANALYSIS_MODEL_NAME,
        modelVersion: REVIEW_ANALYSIS_MODEL_VERSION,
      },
    };
    let analysis = await this.prisma.reviewAnalysis.findUnique({
      where: uniqueKey,
    });
    let claimed = false;

    if (!analysis) {
      try {
        analysis = await this.prisma.reviewAnalysis.create({
          data: {
            ...uniqueKey.safetyReportId_textHash_modelName_modelVersion,
            status: ReviewAnalysisStatus.PENDING,
          },
        });
        claimed = true;
      } catch (error) {
        if (!isUniqueConstraintError(error)) throw error;
        analysis = await this.prisma.reviewAnalysis.findUnique({
          where: uniqueKey,
        });
        if (!analysis) {
          throw new Error('Review analysis conflict could not be resolved.');
        }
      }
    }

    if (analysis.status === ReviewAnalysisStatus.COMPLETED) return;

    if (!claimed) {
      const isFreshPending =
        analysis.status === ReviewAnalysisStatus.PENDING &&
        Date.now() - analysis.updatedAt.getTime() < STALE_ANALYSIS_MS;
      const isRecentFailure =
        analysis.status === ReviewAnalysisStatus.FAILED &&
        Date.now() - analysis.updatedAt.getTime() < FAILED_RETRY_BACKOFF_MS;
      if (isFreshPending || isRecentFailure) return;

      const claim = await this.prisma.reviewAnalysis.updateMany({
        where: {
          id: analysis.id,
          status: analysis.status,
          updatedAt: analysis.updatedAt,
        },
        data: {
          status: ReviewAnalysisStatus.PENDING,
          sentimentLabel: null,
          sentimentScore: null,
          safetyRelevant: null,
          sentimentConfidence: null,
          safetyRelevanceConfidence: null,
        },
      });
      if (claim.count !== 1) return;
    }

    try {
      const result = await this.requestAnalysis(review.description);
      const saved = await this.prisma.reviewAnalysis.updateMany({
        where: { id: analysis.id, status: ReviewAnalysisStatus.PENDING },
        data: {
          sentimentLabel: result.sentimentLabel,
          sentimentScore: result.sentimentScore,
          safetyRelevant: result.safetyRelevant,
          sentimentConfidence: result.sentimentConfidence,
          safetyRelevanceConfidence: result.safetyRelevanceConfidence,
          status: ReviewAnalysisStatus.COMPLETED,
        },
      });
      if (saved.count !== 1) {
        throw new Error('Review analysis result could not be persisted.');
      }
    } catch (error) {
      await this.prisma.reviewAnalysis.updateMany({
        where: { id: analysis.id, status: ReviewAnalysisStatus.PENDING },
        data: { status: ReviewAnalysisStatus.FAILED },
      });
      throw error;
    }
  }

  private async requestAnalysis(text: string): Promise<ReviewAnalysisOutput> {
    const response = await fetch(this.analysisUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(ANALYSIS_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`Review analysis service returned HTTP ${response.status}.`);
    }

    const payload: unknown = await response.json();
    const result = parseReviewAnalysisOutput(payload);
    if (!result) {
      throw new Error('Review analysis service returned an invalid response.');
    }
    return result;
  }
}

function parseReviewAnalysisOutput(
  value: unknown,
): ReviewAnalysisOutput | undefined {
  if (
    !isRecord(value) ||
    !isRecord(value.sentiment) ||
    !isRecord(value.safetyRelevance) ||
    typeof value.modelName !== 'string' ||
    value.modelName !== REVIEW_ANALYSIS_MODEL_NAME ||
    typeof value.modelVersion !== 'string' ||
    value.modelVersion !== REVIEW_ANALYSIS_MODEL_VERSION ||
    !Object.values(ReviewSentimentLabel).includes(
      value.sentiment.label as ReviewSentimentLabel,
    ) ||
    !isFiniteInRange(value.sentiment.score, -1, 1) ||
    !isFiniteInRange(value.sentiment.confidence, 0, 1) ||
    typeof value.safetyRelevance.isRelevant !== 'boolean' ||
    !isFiniteInRange(value.safetyRelevance.confidence, 0, 1)
  ) {
    return undefined;
  }

  return {
    sentimentLabel: value.sentiment.label as ReviewSentimentLabel,
    sentimentScore: value.sentiment.score,
    safetyRelevant: value.safetyRelevance.isRelevant,
    sentimentConfidence: value.sentiment.confidence,
    safetyRelevanceConfidence: value.safetyRelevance.confidence,
    modelName: value.modelName,
    modelVersion: value.modelVersion,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteInRange(
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

function isUniqueConstraintError(
  error: unknown,
): error is { code: 'P2002' } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002'
  );
}
