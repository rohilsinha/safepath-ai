"""Pure deterministic scoring for validated normalized risk values."""

from collections.abc import Mapping
from math import floor, isclose, isfinite

from services.ai.contracts.safety_assessment import (
    AssessmentStatus,
    CategoryAssessment,
    EvidenceCategory,
    NormalizedRiskValues,
    RiskLevel,
    RouteSegmentEvidence,
    SafetyEvidence,
    SafetyAssessment,
)


DEFAULT_WEIGHTS: Mapping[EvidenceCategory, float] = {
    EvidenceCategory.CRIME_HISTORY: 0.30,
    EvidenceCategory.RECENT_INCIDENTS_NEWS: 0.25,
    EvidenceCategory.COMMUNITY_REPORTS: 0.20,
    EvidenceCategory.ENVIRONMENTAL_FACTORS: 0.15,
    EvidenceCategory.CROWD_ACTIVITY: 0.10,
}

RISK_LEVEL_BOUNDARIES = (
    (80, RiskLevel.LOW),
    (60, RiskLevel.MODERATE),
    (40, RiskLevel.HIGH),
    (0, RiskLevel.VERY_HIGH),
)
SCORING_POLICY_VERSION = "1.0"
WEIGHT_SUM_TOLERANCE = 1e-9


def validate_weights(
    weights: Mapping[EvidenceCategory, float],
) -> dict[EvidenceCategory, float]:
    if not isinstance(weights, Mapping) or set(weights) != set(EvidenceCategory):
        raise ValueError("Weights must define every evidence category exactly once.")

    validated: dict[EvidenceCategory, float] = {}
    for category in EvidenceCategory:
        weight = weights[category]
        if isinstance(weight, bool) or not isinstance(weight, (int, float)):
            raise ValueError(f"Weight for {category.value} must be a finite number.")
        numeric_weight = float(weight)
        if not isfinite(numeric_weight) or numeric_weight < 0:
            raise ValueError(f"Weight for {category.value} must be finite and non-negative.")
        validated[category] = numeric_weight

    if not isclose(sum(validated.values()), 1.0, rel_tol=0.0, abs_tol=WEIGHT_SUM_TOLERANCE):
        raise ValueError("Weights must sum to 1.0.")
    return validated


def validate_risk_values(
    risk_values: NormalizedRiskValues | Mapping[EvidenceCategory, float | None],
) -> dict[EvidenceCategory, float | None]:
    values = risk_values.values if isinstance(risk_values, NormalizedRiskValues) else risk_values
    if not isinstance(values, Mapping) or set(values) != set(EvidenceCategory):
        raise ValueError("Risk values must define every evidence category exactly once.")

    validated: dict[EvidenceCategory, float | None] = {}
    for category in EvidenceCategory:
        value = values[category]
        if value is None:
            validated[category] = None
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"Risk value for {category.value} must be a finite number or None.")
        numeric_value = float(value)
        if not isfinite(numeric_value) or not 0 <= numeric_value <= 100:
            raise ValueError(f"Risk value for {category.value} must be between 0 and 100.")
        validated[category] = numeric_value
    return validated


def risk_level_for_score(score: int) -> RiskLevel:
    if isinstance(score, bool) or not isinstance(score, int) or not 0 <= score <= 100:
        raise ValueError("Score must be an integer from 0 to 100.")
    for minimum_score, level in RISK_LEVEL_BOUNDARIES:
        if score >= minimum_score:
            return level
    raise AssertionError("Risk-level boundaries must cover all valid scores.")


def assess_safety(
    risk_values: NormalizedRiskValues | Mapping[EvidenceCategory, float | None],
    *,
    route_id: str | None = None,
    weights: Mapping[EvidenceCategory, float] = DEFAULT_WEIGHTS,
    route_segment_evidence: RouteSegmentEvidence = (),
) -> SafetyAssessment:
    """Calculate a weighted score without interpreting evidence or filling gaps."""
    if route_id is not None and (not isinstance(route_id, str) or not route_id.strip()):
        raise ValueError("route_id must be a non-empty string or None.")
    if not isinstance(route_segment_evidence, tuple) or any(
        not isinstance(item, SafetyEvidence) for item in route_segment_evidence
    ):
        raise ValueError("route_segment_evidence must be a tuple of SafetyEvidence.")

    normalized = validate_risk_values(risk_values)
    validated_weights = validate_weights(weights)

    available = {
        category: value
        for category, value in normalized.items()
        if value is not None and validated_weights[category] > 0
    }
    available_weight = sum(validated_weights[category] for category in available)
    category_assessments = {
        category: CategoryAssessment(
            risk_value=normalized[category],
            available=normalized[category] is not None,
            weight=validated_weights[category],
        )
        for category in EvidenceCategory
    }

    if not available:
        return SafetyAssessment(
            score=None,
            risk_level=RiskLevel.INSUFFICIENT_DATA,
            status=AssessmentStatus.INSUFFICIENT_DATA,
            route_id=route_id,
            category_assessments=category_assessments,
            data_coverage=0.0,
            available_weight=0.0,
            weights_used={},
            weighted_risk=None,
            route_segment_evidence=route_segment_evidence,
            explanation_context={
                "policy_version": SCORING_POLICY_VERSION,
                "available_categories": 0,
                "total_categories": len(EvidenceCategory),
            },
        )

    weighted_risk = sum(
        float(normalized[category]) * validated_weights[category]
        for category in available
    ) / available_weight
    score = max(0, min(100, floor(100 - weighted_risk + 0.5)))
    used_weights = {
        category: validated_weights[category] / available_weight
        for category in available
    }

    return SafetyAssessment(
        score=score,
        risk_level=risk_level_for_score(score),
        status=AssessmentStatus.COMPLETE,
        route_id=route_id,
        category_assessments=category_assessments,
        data_coverage=available_weight,
        available_weight=available_weight,
        weights_used=used_weights,
        weighted_risk=weighted_risk,
        route_segment_evidence=route_segment_evidence,
        explanation_context={
            "policy_version": SCORING_POLICY_VERSION,
            "available_categories": len(available),
            "total_categories": len(EvidenceCategory),
            "missing_categories": ", ".join(
                category.value
                for category in EvidenceCategory
                if normalized[category] is None
            ),
        },
    )
