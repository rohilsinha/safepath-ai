"""Typed contracts for evidence and deterministic safety assessments."""

from dataclasses import dataclass
from datetime import datetime
from enum import StrEnum
from typing import Literal, Mapping, TypedDict


class EvidenceCategory(StrEnum):
    CRIME_HISTORY = "crime_history"
    RECENT_INCIDENTS_NEWS = "recent_incidents_news"
    COMMUNITY_REPORTS = "community_reports"
    ENVIRONMENTAL_FACTORS = "environmental_factors"
    CROWD_ACTIVITY = "crowd_activity"


class RiskLevel(StrEnum):
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"
    VERY_HIGH = "very_high"
    INSUFFICIENT_DATA = "insufficient_data"


class AssessmentStatus(StrEnum):
    COMPLETE = "complete"
    INSUFFICIENT_DATA = "insufficient_data"


class ReviewSentimentLabel(StrEnum):
    POSITIVE = "POSITIVE"
    NEUTRAL = "NEUTRAL"
    NEGATIVE = "NEGATIVE"
    UNCERTAIN = "UNCERTAIN"


class ReviewAnalysisEvidence(TypedDict):
    sentimentLabel: Literal["POSITIVE", "NEUTRAL", "NEGATIVE", "UNCERTAIN"]
    sentimentScore: float
    safetyRelevant: bool
    sentimentConfidence: float
    safetyRelevanceConfidence: float
    modelName: str
    modelVersion: str
    analyzedAt: str


@dataclass(frozen=True)
class SafetyEvidence:
    """A sourced evidence record; it is not itself a normalized risk value."""

    id: str
    category: EvidenceCategory
    source_reference: str
    description: str
    observed_at: datetime
    collected_at: datetime
    severity: float
    recency: float
    confidence: float | None
    geographic_relevance: float
    route_id: str | None = None
    segment_id: str | None = None
    review_analysis: ReviewAnalysisEvidence | None = None


RouteSegmentEvidence = tuple[SafetyEvidence, ...]


@dataclass(frozen=True)
class NormalizedRiskValues:
    """Validated category risks on a 0–100 scale; None means unavailable."""

    values: Mapping[EvidenceCategory, float | None]


@dataclass(frozen=True)
class CategoryAssessment:
    risk_value: float | None
    available: bool
    weight: float


@dataclass(frozen=True)
class SafetyAssessment:
    score: int | None
    risk_level: RiskLevel
    status: AssessmentStatus
    route_id: str | None
    category_assessments: Mapping[EvidenceCategory, CategoryAssessment]
    data_coverage: float
    available_weight: float
    weights_used: Mapping[EvidenceCategory, float]
    weighted_risk: float | None
    explanation_context: Mapping[str, str | float | int | None]
    route_segment_evidence: RouteSegmentEvidence = ()
