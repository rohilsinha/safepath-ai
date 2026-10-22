import type { CommunityReviewAnalysisResponse } from './api';

export type ReviewAnalysisPresentation =
  | { kind: 'positive'; title: string; badge: string; confidence: string; icon: string }
  | { kind: 'negative'; title: string; badge: string; confidence: string; icon: string }
  | { kind: 'unclear'; title: string; badge: string; icon: string }
  | { kind: 'pending'; title: string; icon: string }
  | { kind: 'failed'; title: string; icon: string };

// Classify at >= 0.60 on both heuristic confidences; call it high only at >= 0.75 on both.
export const HIGH_CONFIDENCE_THRESHOLD = 0.75;
const MIN_CLASSIFICATION_CONFIDENCE = 0.6;

export function formatSentimentScore(score: number | null): string | null {
  if (score === null || !Number.isFinite(score) || score < -1 || score > 1) {
    return null;
  }
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2);
}

export function getReviewAnalysisPresentation(
  analysis: CommunityReviewAnalysisResponse | null,
): ReviewAnalysisPresentation {
  if (!analysis || analysis.status === 'FAILED') {
    return { kind: 'failed', title: 'Analysis unavailable', icon: '−' };
  }
  if (analysis.status === 'PENDING') {
    return { kind: 'pending', title: 'Analyzing review…', icon: '…' };
  }

  if (
    analysis.safetyRelevant !== true ||
    (analysis.sentimentLabel !== 'POSITIVE' &&
      analysis.sentimentLabel !== 'NEGATIVE') ||
    analysis.sentimentConfidence === null ||
    analysis.safetyRelevanceConfidence === null
  ) {
    return unclearPresentation();
  }

  const confidence = Math.min(
    analysis.sentimentConfidence,
    analysis.safetyRelevanceConfidence,
  );
  if (confidence < MIN_CLASSIFICATION_CONFIDENCE) {
    return unclearPresentation();
  }

  const confidenceLabel =
    confidence >= HIGH_CONFIDENCE_THRESHOLD
      ? 'High confidence'
      : 'Moderate confidence';
  if (analysis.sentimentLabel === 'POSITIVE') {
    return {
      kind: 'positive',
      title: 'Positive safety experience',
      badge: 'Positive',
      confidence: confidenceLabel,
      icon: '✓',
    };
  }
  return {
    kind: 'negative',
    title: 'Negative safety experience',
    badge: 'Negative',
    confidence: confidenceLabel,
    icon: '!',
  };
}

function unclearPresentation(): ReviewAnalysisPresentation {
  return {
    kind: 'unclear',
    title: 'Unclear or irrelevant review',
    badge: 'Neutral / insufficient safety evidence',
    icon: '−',
  };
}
