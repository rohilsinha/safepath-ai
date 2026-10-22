"""Local JSON service exposing the existing deterministic safety scorer."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from datetime import datetime
from typing import Any

from services.ai.contracts.safety_assessment import (
    EvidenceCategory,
    ReviewAnalysisEvidence,
    ReviewSentimentLabel,
)
from services.ai.nlp_analyzer import MAX_REVIEW_LENGTH, analyze_review_text
from services.ai.scoring import SCORING_POLICY_VERSION, assess_safety


MAX_REQUEST_BYTES = 64 * 1024
MAX_ROUTES_PER_REQUEST = 10
CATEGORY_NAMES = {category.value for category in EvidenceCategory}


def analyze_review(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict) or set(payload) != {"text"}:
        raise ValueError("Request must contain only the submitted review text.")
    text = payload["text"]
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Review text must be a non-empty string.")
    if len(text) > MAX_REVIEW_LENGTH:
        raise ValueError("Review text must not exceed 500 characters.")
    return analyze_review_text(text)


def assess_routes(payload: Any) -> dict[str, list[dict[str, Any]]]:
    legacy_fields = {"routeIds", "riskValues", "evidenceByRoute"}
    route_risk_fields = {"routeIds", "riskValuesByRoute", "evidenceByRoute"}
    if not isinstance(payload, dict) or frozenset(payload) not in {
        frozenset(legacy_fields),
        frozenset(route_risk_fields),
    }:
        raise ValueError(
            "Request must contain routeIds, risk values, and evidenceByRoute."
        )

    route_ids = payload["routeIds"]
    if (
        not isinstance(route_ids, list)
        or not route_ids
        or len(route_ids) > MAX_ROUTES_PER_REQUEST
        or any(
            not isinstance(route_id, str)
            or not route_id.strip()
            or len(route_id) > 128
            for route_id in route_ids
        )
        or len(set(route_ids)) != len(route_ids)
    ):
        raise ValueError("routeIds must contain unique, non-empty route identifiers.")

    if "riskValuesByRoute" in payload:
        risk_values_by_route = payload["riskValuesByRoute"]
        if (
            not isinstance(risk_values_by_route, dict)
            or set(risk_values_by_route) != set(route_ids)
            or any(
                not isinstance(values, dict) or set(values) != CATEGORY_NAMES
                for values in risk_values_by_route.values()
            )
        ):
            raise ValueError(
                "riskValuesByRoute must define every category for every route."
            )
    else:
        risk_values = payload["riskValues"]
        if not isinstance(risk_values, dict) or set(risk_values) != CATEGORY_NAMES:
            raise ValueError("riskValues must define every evidence category.")
        risk_values_by_route = {
            route_id: risk_values for route_id in route_ids
        }

    evidence_by_route = payload["evidenceByRoute"]
    if (
        not isinstance(evidence_by_route, dict)
        or set(evidence_by_route) - set(route_ids)
        or any(
            not isinstance(records, list)
            or len(records) > 100
            for records in evidence_by_route.values()
        )
    ):
        raise ValueError("evidenceByRoute must contain bounded evidence lists for known routes.")

    results = []
    for route_id in route_ids:
        normalized_values = {
            EvidenceCategory(category): value
            for category, value in risk_values_by_route[route_id].items()
        }
        evidence = [
            validate_community_evidence(route_id, item)
            for item in evidence_by_route.get(route_id, [])
        ]
        assessment = assess_safety(normalized_values, route_id=route_id)
        results.append(
            {
                "routeId": route_id,
                "score": assessment.score,
                "riskLevel": assessment.risk_level.value,
                "status": assessment.status.value,
                "dataCoverage": assessment.data_coverage,
                "categoryRisks": {
                    category.value: {
                        "riskValue": category_assessment.risk_value,
                        "available": category_assessment.available,
                        "weight": category_assessment.weight,
                    }
                    for category, category_assessment in (
                        assessment.category_assessments.items()
                    )
                },
                "weightsUsed": {
                    category.value: weight
                    for category, weight in assessment.weights_used.items()
                },
                "evidence": evidence,
                "policyVersion": SCORING_POLICY_VERSION,
                "explanationContext": {
                    **assessment.explanation_context,
                    "communityEvidenceLimitation": (
                        "Approved community reports are user-submitted claims, "
                        "not verified incidents; they do not produce a score."
                    ),
                },
            }
        )

    return {"assessments": results}


def validate_community_evidence(route_id: str, item: Any) -> dict[str, Any]:
    required_fields = {
        "id",
        "category",
        "sourceReference",
        "description",
        "observedAt",
        "collectedAt",
        "severity",
        "recency",
        "confidence",
        "geographicRelevance",
        "reportCategory",
        "reportedSeverity",
        "routeId",
        "segmentId",
    }
    if not isinstance(item, dict) or (
        set(item) != required_fields
        and set(item) != required_fields | {"reviewAnalysis"}
    ):
        raise ValueError("Community evidence has an invalid shape.")
    if (
        not isinstance(item["id"], str)
        or not item["id"]
        or item["category"] != EvidenceCategory.COMMUNITY_REPORTS.value
        or item["sourceReference"] != "accepted_community_report"
        or not isinstance(item["description"], str)
        or not item["description"]
        or item["routeId"] != route_id
        or not isinstance(item["segmentId"], str)
        or not item["segmentId"]
        or item["reportCategory"]
        not in {
            "HARASSMENT",
            "UNSAFE_AREA",
            "POOR_LIGHTING",
            "SUSPICIOUS_ACTIVITY",
            "OTHER",
        }
        or item["reportedSeverity"] not in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
    ):
        raise ValueError("Community evidence contains invalid identifiers or provenance.")

    validated: dict[str, Any] = dict(item)
    for field in ("severity", "recency", "geographicRelevance"):
        value = item[field]
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError(f"Community evidence {field} must be between 0 and 1.")
        if not 0 <= value <= 1:
            raise ValueError(f"Community evidence {field} must be between 0 and 1.")
        validated[field] = float(value)
    if item["confidence"] is not None:
        raise ValueError("Unverified community reports cannot claim confidence.")
    for field in ("observedAt", "collectedAt"):
        timestamp = item[field]
        if not isinstance(timestamp, str):
            raise ValueError(f"Community evidence {field} must be an ISO timestamp.")
        try:
            datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except ValueError as error:
            raise ValueError(
                f"Community evidence {field} must be an ISO timestamp."
            ) from error
    if "reviewAnalysis" in item:
        validated["reviewAnalysis"] = validate_review_analysis(
            item["reviewAnalysis"]
        )
    return validated


def validate_review_analysis(value: Any) -> ReviewAnalysisEvidence:
    required_fields = {
        "sentimentLabel",
        "sentimentScore",
        "safetyRelevant",
        "sentimentConfidence",
        "safetyRelevanceConfidence",
        "modelName",
        "modelVersion",
        "analyzedAt",
    }
    if not isinstance(value, dict) or set(value) != required_fields:
        raise ValueError("Community review analysis has an invalid shape.")
    if (
        not isinstance(value["sentimentLabel"], str)
        or value["sentimentLabel"] not in {label.value for label in ReviewSentimentLabel}
        or not is_finite_in_range(value["sentimentScore"], -1, 1)
        or not isinstance(value["safetyRelevant"], bool)
        or not is_finite_in_range(value["sentimentConfidence"], 0, 1)
        or not is_finite_in_range(value["safetyRelevanceConfidence"], 0, 1)
        or not isinstance(value["modelName"], str)
        or not value["modelName"]
        or not isinstance(value["modelVersion"], str)
        or not value["modelVersion"]
        or not isinstance(value["analyzedAt"], str)
    ):
        raise ValueError("Community review analysis contains invalid values.")
    try:
        datetime.fromisoformat(value["analyzedAt"].replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError(
            "Community review analysis analyzedAt must be an ISO timestamp."
        ) from error
    return value


def is_finite_in_range(value: Any, minimum: float, maximum: float) -> bool:
    return (
        not isinstance(value, bool)
        and isinstance(value, (int, float))
        and minimum <= value <= maximum
        and value == value
        and value not in (float("inf"), float("-inf"))
    )


class SafetyScoringHandler(BaseHTTPRequestHandler):
    server_version = "SafePathSafetyScorer/1.0"

    def do_GET(self) -> None:
        if self.path != "/health":
            self._write_json(404, {"error": "Not found."})
            return
        self._write_json(200, {"status": "ok"})

    def do_POST(self) -> None:
        if self.path not in {"/assess", "/analyze-review"}:
            self._write_json(404, {"error": "Not found."})
            return

        content_length = self.headers.get("Content-Length")
        try:
            length = int(content_length or "")
        except ValueError:
            self._write_json(400, {"error": "Content-Length must be an integer."})
            return
        if length <= 0 or length > MAX_REQUEST_BYTES:
            self._write_json(413, {"error": "Request body size is invalid."})
            return

        try:
            payload = json.loads(self.rfile.read(length))
            response = (
                assess_routes(payload)
                if self.path == "/assess"
                else analyze_review(payload)
            )
        except (json.JSONDecodeError, UnicodeDecodeError):
            self._write_json(400, {"error": "Request body must be valid JSON."})
            return
        except ValueError as error:
            self._write_json(400, {"error": str(error)})
            return
        except Exception as error:
            self.log_error("Scoring failed: %s", type(error).__name__)
            self._write_json(500, {"error": "Scoring is temporarily unavailable."})
            return

        self._write_json(200, response)

    def _write_json(self, status: int, payload: dict[str, Any]) -> None:
        body = json.dumps(payload, allow_nan=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        return


def main() -> None:
    port = int(os.environ.get("SAFETY_SCORING_PORT", "8001"))
    server = ThreadingHTTPServer(("127.0.0.1", port), SafetyScoringHandler)
    print(f"Safety scoring service listening on 127.0.0.1:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
