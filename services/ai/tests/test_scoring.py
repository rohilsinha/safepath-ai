"""Unit tests for the deterministic scoring policy."""

import unittest
from datetime import datetime, timezone

from services.ai.contracts.safety_assessment import (
    AssessmentStatus,
    EvidenceCategory,
    RiskLevel,
    SafetyEvidence,
)
from services.ai.scoring import (
    DEFAULT_WEIGHTS,
    assess_safety,
    risk_level_for_score,
    validate_weights,
)


# TEST FIXTURE ONLY: synthetic normalized risks; never production evidence.
TEST_RISKS = {
    EvidenceCategory.CRIME_HISTORY: 20,
    EvidenceCategory.RECENT_INCIDENTS_NEWS: 40,
    EvidenceCategory.COMMUNITY_REPORTS: 30,
    EvidenceCategory.ENVIRONMENTAL_FACTORS: 50,
    EvidenceCategory.CROWD_ACTIVITY: 20,
}


class SafetyScoringTests(unittest.TestCase):
    def test_all_categories_available_with_low_risk(self) -> None:
        result = assess_safety({category: 10 for category in EvidenceCategory})

        self.assertEqual(result.score, 90)
        self.assertEqual(result.risk_level, RiskLevel.LOW)
        self.assertEqual(result.status, AssessmentStatus.COMPLETE)
        self.assertEqual(result.data_coverage, 1.0)

    def test_all_categories_available_with_high_risk(self) -> None:
        result = assess_safety({category: 90 for category in EvidenceCategory})

        self.assertEqual(result.score, 10)
        self.assertEqual(result.risk_level, RiskLevel.VERY_HIGH)

    def test_mixed_weighted_calculation(self) -> None:
        result = assess_safety(TEST_RISKS, route_id="route-test")

        self.assertEqual(result.route_id, "route-test")
        self.assertEqual(result.weighted_risk, 31.5)
        self.assertEqual(result.score, 69)
        self.assertEqual(result.risk_level, RiskLevel.MODERATE)

    def test_missing_categories_are_visible_and_reduce_coverage(self) -> None:
        risks = dict(TEST_RISKS)
        risks[EvidenceCategory.CRIME_HISTORY] = None

        result = assess_safety(risks)

        self.assertEqual(result.score, 64)
        self.assertAlmostEqual(result.data_coverage, 0.70)
        self.assertFalse(
            result.category_assessments[EvidenceCategory.CRIME_HISTORY].available
        )
        self.assertIn(
            EvidenceCategory.CRIME_HISTORY.value,
            result.explanation_context["missing_categories"],
        )
        self.assertNotIn(EvidenceCategory.CRIME_HISTORY, result.weights_used)

    def test_no_available_categories_returns_insufficient_data_without_score(self) -> None:
        result = assess_safety({category: None for category in EvidenceCategory})

        self.assertIsNone(result.score)
        self.assertIsNone(result.weighted_risk)
        self.assertEqual(result.risk_level, RiskLevel.INSUFFICIENT_DATA)
        self.assertEqual(result.status, AssessmentStatus.INSUFFICIENT_DATA)
        self.assertEqual(result.data_coverage, 0.0)

    def test_risk_level_boundaries(self) -> None:
        expected = {
            80: RiskLevel.LOW,
            79: RiskLevel.MODERATE,
            60: RiskLevel.MODERATE,
            59: RiskLevel.HIGH,
            40: RiskLevel.HIGH,
            39: RiskLevel.VERY_HIGH,
        }

        for score, risk_level in expected.items():
            with self.subTest(score=score):
                self.assertEqual(risk_level_for_score(score), risk_level)

    def test_identical_input_returns_identical_output(self) -> None:
        self.assertEqual(assess_safety(TEST_RISKS), assess_safety(TEST_RISKS))

    def test_invalid_and_non_finite_risk_values_are_rejected(self) -> None:
        for invalid in (-0.01, 100.01, float("nan"), float("inf"), float("-inf"), True):
            risks = dict(TEST_RISKS)
            risks[EvidenceCategory.CRIME_HISTORY] = invalid
            with self.subTest(value=invalid), self.assertRaises(ValueError):
                assess_safety(risks)

    def test_malformed_risk_values_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            assess_safety({EvidenceCategory.CRIME_HISTORY: 20})

        risks = dict(TEST_RISKS)
        risks[EvidenceCategory.CRIME_HISTORY] = "20"
        with self.assertRaises(ValueError):
            assess_safety(risks)

    def test_invalid_weights_are_rejected(self) -> None:
        invalid_weight_sets = []

        negative = dict(DEFAULT_WEIGHTS)
        negative[EvidenceCategory.CRIME_HISTORY] = -0.1
        invalid_weight_sets.append(negative)

        non_finite = dict(DEFAULT_WEIGHTS)
        non_finite[EvidenceCategory.CRIME_HISTORY] = float("nan")
        invalid_weight_sets.append(non_finite)

        wrong_sum = dict(DEFAULT_WEIGHTS)
        wrong_sum[EvidenceCategory.CRIME_HISTORY] = 0.31
        invalid_weight_sets.append(wrong_sum)

        missing_category = dict(DEFAULT_WEIGHTS)
        missing_category.pop(EvidenceCategory.CRIME_HISTORY)
        invalid_weight_sets.append(missing_category)

        for weights in invalid_weight_sets:
            with self.subTest(weights=weights), self.assertRaises(ValueError):
                assess_safety(TEST_RISKS, weights=weights)

    def test_configured_weights_sum_to_one(self) -> None:
        self.assertAlmostEqual(sum(validate_weights(DEFAULT_WEIGHTS).values()), 1.0)

    def test_route_id_is_optional(self) -> None:
        result = assess_safety(TEST_RISKS)

        self.assertIsNone(result.route_id)

    def test_route_segment_evidence_is_preserved_without_processing(self) -> None:
        # TEST FIXTURE ONLY: synthetic evidence used to verify contract plumbing.
        evidence = SafetyEvidence(
            id="evidence-test",
            category=EvidenceCategory.COMMUNITY_REPORTS,
            source_reference="test-source",
            description="Synthetic test evidence.",
            observed_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            collected_at=datetime(2026, 1, 2, tzinfo=timezone.utc),
            severity=0.5,
            recency=0.5,
            confidence=0.5,
            geographic_relevance=0.5,
            route_id="route-test",
            segment_id="segment-test",
        )

        result = assess_safety(
            TEST_RISKS,
            route_id="route-test",
            route_segment_evidence=(evidence,),
        )

        self.assertEqual(result.route_segment_evidence, (evidence,))
        self.assertEqual(result.score, 69)

    def test_malformed_route_association_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            assess_safety(TEST_RISKS, route_id=" ")
        with self.assertRaises(ValueError):
            assess_safety(TEST_RISKS, route_segment_evidence=("not evidence",))


if __name__ == "__main__":
    unittest.main()
