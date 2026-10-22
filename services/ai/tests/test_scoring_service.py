"""Protocol tests for the JSON scoring-service boundary."""

import json
import unittest
from http.server import ThreadingHTTPServer
from threading import Thread
from urllib.request import Request, urlopen

from services.ai.contracts.safety_assessment import EvidenceCategory
from services.ai.server import (
    SafetyScoringHandler,
    analyze_review,
    assess_routes,
)


# TEST FIXTURE ONLY: synthetic normalized risks, not production evidence.
TEST_RISK_VALUES = {
    category.value: 20
    for category in EvidenceCategory
}


class ScoringServiceTests(unittest.TestCase):
    def test_review_analysis_endpoint_uses_submitted_text(self) -> None:
        result = analyze_review(
            {"text": "The road was bright and felt safe."}
        )

        self.assertEqual(result["sentiment"]["label"], "POSITIVE")
        self.assertTrue(result["safetyRelevance"]["isRelevant"])
        self.assertEqual(result["modelName"], "safepath-lexical")

    def test_review_analysis_endpoint_rejects_non_text_or_extra_fields(self) -> None:
        for payload in (
            {"text": ""},
            {"text": "A valid review", "synthetic": True},
            {"text": "x" * 501},
        ):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                analyze_review(payload)

    def test_existing_http_server_exposes_review_analysis_route(self) -> None:
        server = ThreadingHTTPServer(("127.0.0.1", 0), SafetyScoringHandler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            request = Request(
                f"http://127.0.0.1:{server.server_port}/analyze-review",
                data=json.dumps({"text": "The road felt safe."}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                method="POST",
            )
            with urlopen(request, timeout=2) as response:
                result = json.loads(response.read())
            self.assertEqual(result["sentiment"]["label"], "POSITIVE")
            self.assertTrue(result["safetyRelevance"]["isRelevant"])
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=2)

    def test_route_specific_demo_risks_are_assessed_independently(self) -> None:
        risk_values = {
            "route-1": {
                category.value: 20 if category is EvidenceCategory.ENVIRONMENTAL_FACTORS else None
                for category in EvidenceCategory
            },
            "route-2": {
                category.value: 80 if category is EvidenceCategory.CRIME_HISTORY else None
                for category in EvidenceCategory
            },
        }
        result = assess_routes(
            {
                "routeIds": ["route-1", "route-2"],
                "riskValuesByRoute": risk_values,
                "evidenceByRoute": {"route-1": [], "route-2": []},
            }
        )

        first, second = result["assessments"]
        self.assertEqual(first["score"], 80)
        self.assertEqual(second["score"], 20)
        self.assertEqual(
            first["categoryRisks"]["environmental_factors"]["riskValue"],
            20,
        )
        self.assertEqual(first["categoryRisks"]["crime_history"]["riskValue"], None)

    def test_route_specific_risks_require_every_route_and_category(self) -> None:
        with self.assertRaises(ValueError):
            assess_routes(
                {
                    "routeIds": ["route-1"],
                    "riskValuesByRoute": {"route-1": {"crime_history": 80}},
                    "evidenceByRoute": {"route-1": []},
                }
            )

    def test_community_reports_alone_still_produce_no_route_score(self) -> None:
        evidence = {
            "id": "report-test",
            "category": "community_reports",
            "sourceReference": "accepted_community_report",
            "description": "User-submitted information; not a verified incident.",
            "observedAt": "2026-10-01T12:00:00+00:00",
            "collectedAt": "2026-10-02T12:00:00+00:00",
            "severity": 1.0,
            "recency": 1.0,
            "confidence": None,
            "geographicRelevance": 1.0,
            "reportCategory": "POOR_LIGHTING",
            "reportedSeverity": "CRITICAL",
            "routeId": "route-1",
            "segmentId": "segment-1",
        }
        result = assess_routes(
            {
                "routeIds": ["route-1"],
                "riskValuesByRoute": {
                    "route-1": {
                        category.value: None for category in EvidenceCategory
                    }
                },
                "evidenceByRoute": {"route-1": [evidence]},
            }
        )

        assessment = result["assessments"][0]
        self.assertIsNone(assessment["score"])
        self.assertEqual(assessment["status"], "insufficient_data")
        self.assertEqual(assessment["evidence"], [evidence])

    def test_assesses_all_routes_using_the_existing_engine(self) -> None:
        result = assess_routes(
            {
                "routeIds": ["route-1", "route-2"],
                "riskValues": TEST_RISK_VALUES,
                "evidenceByRoute": {},
            }
        )

        self.assertEqual(
            [item["routeId"] for item in result["assessments"]],
            ["route-1", "route-2"],
        )
        self.assertEqual(result["assessments"][0]["score"], 80)
        self.assertEqual(result["assessments"][0]["status"], "complete")
        self.assertEqual(result["assessments"][0]["dataCoverage"], 1.0)
        self.assertEqual(result["assessments"][0]["evidence"], [])

    def test_missing_evidence_returns_explicit_insufficient_data(self) -> None:
        risk_values = {category.value: None for category in EvidenceCategory}
        result = assess_routes(
            {
                "routeIds": ["route-1"],
                "riskValues": risk_values,
                "evidenceByRoute": {},
            }
        )
        assessment = result["assessments"][0]

        self.assertIsNone(assessment["score"])
        self.assertEqual(assessment["riskLevel"], "insufficient_data")
        self.assertEqual(assessment["status"], "insufficient_data")
        self.assertEqual(assessment["dataCoverage"], 0.0)
        self.assertTrue(
            all(not item["available"] for item in assessment["categoryRisks"].values())
        )

    def test_malformed_requests_are_rejected(self) -> None:
        with self.assertRaises(ValueError):
            assess_routes(
                {
                    "routeIds": [],
                    "riskValues": TEST_RISK_VALUES,
                    "evidenceByRoute": {},
                }
            )
        with self.assertRaises(ValueError):
            assess_routes(
                {
                    "routeIds": ["route-1"],
                    "riskValues": {"crime_history": 10},
                    "evidenceByRoute": {},
                }
            )
        invalid_risks = dict(TEST_RISK_VALUES)
        invalid_risks["crime_history"] = float("nan")
        with self.assertRaises(ValueError):
            assess_routes(
                {
                    "routeIds": ["route-1"],
                    "riskValues": invalid_risks,
                    "evidenceByRoute": {},
                }
            )

    def test_accepted_report_evidence_is_returned_without_a_score(self) -> None:
        evidence = {
            "id": "report-test",
            "category": "community_reports",
            "sourceReference": "accepted_community_report",
            "description": "Accepted user-submitted information; not a verified incident.",
            "observedAt": "2026-10-01T12:00:00+00:00",
            "collectedAt": "2026-10-02T12:00:00+00:00",
            "severity": 0.5,
            "recency": 0.7,
            "confidence": None,
            "geographicRelevance": 0.8,
            "reportCategory": "POOR_LIGHTING",
            "reportedSeverity": "MEDIUM",
            "routeId": "route-1",
            "segmentId": "segment-1",
        }
        result = assess_routes(
            {
                "routeIds": ["route-1"],
                "riskValues": {
                    category.value: None for category in EvidenceCategory
                },
                "evidenceByRoute": {"route-1": [evidence]},
            }
        )
        assessment = result["assessments"][0]
        self.assertIsNone(assessment["score"])
        self.assertEqual(assessment["status"], "insufficient_data")
        self.assertEqual(assessment["evidence"], [evidence])

    def test_review_analysis_is_context_only_and_cannot_create_a_score(self) -> None:
        evidence = {
            "id": "report-test",
            "category": "community_reports",
            "sourceReference": "accepted_community_report",
            "description": "User-submitted information; not a verified incident.",
            "observedAt": "2026-10-01T12:00:00+00:00",
            "collectedAt": "2026-10-02T12:00:00+00:00",
            "severity": 1.0,
            "recency": 1.0,
            "confidence": None,
            "geographicRelevance": 1.0,
            "reportCategory": "POOR_LIGHTING",
            "reportedSeverity": "CRITICAL",
            "routeId": "route-1",
            "segmentId": "segment-1",
            "reviewAnalysis": {
                "sentimentLabel": "NEGATIVE",
                "sentimentScore": -1.0,
                "safetyRelevant": True,
                "sentimentConfidence": 0.9,
                "safetyRelevanceConfidence": 0.95,
                "modelName": "safepath-lexical",
                "modelVersion": "1.0.0",
                "analyzedAt": "2026-10-02T12:00:00+00:00",
            },
        }
        result = assess_routes(
            {
                "routeIds": ["route-1"],
                "riskValuesByRoute": {
                    "route-1": {
                        category.value: None for category in EvidenceCategory
                    }
                },
                "evidenceByRoute": {"route-1": [evidence]},
            }
        )

        assessment = result["assessments"][0]
        self.assertIsNone(assessment["score"])
        self.assertEqual(assessment["status"], "insufficient_data")
        self.assertEqual(assessment["evidence"][0]["reviewAnalysis"], evidence["reviewAnalysis"])

    def test_malformed_community_evidence_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            assess_routes(
                {
                    "routeIds": ["route-1"],
                    "riskValues": {
                        category.value: None for category in EvidenceCategory
                    },
                    "evidenceByRoute": {
                        "route-1": [{"id": "malformed"}]
                    },
                }
            )


if __name__ == "__main__":
    unittest.main()
