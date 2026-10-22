"""Versioned, local lexical analysis for submitted community-report text."""

from __future__ import annotations

import re
from collections import Counter
from typing import Any

from services.ai.contracts.safety_assessment import ReviewSentimentLabel


MODEL_NAME = "safepath-lexical"
MODEL_VERSION = "1.0.0"
MAX_REVIEW_LENGTH = 500

_TOKEN_PATTERN = re.compile(r"[a-z]+(?:'[a-z]+)?")
_POSITIVE_WORDS = frozenset(
    {
        "bright",
        "comfortable",
        "helpful",
        "lit",
        "safe",
        "secure",
        "welcoming",
    }
)
_NEGATIVE_WORDS = frozenset(
    {
        "assaulted",
        "dark",
        "dangerous",
        "harassed",
        "isolated",
        "poor",
        "scary",
        "threatened",
        "unsafe",
        "followed",
    }
)
_SAFETY_WORDS = frozenset(
    {
        "assault",
        "assaulted",
        "bright",
        "crime",
        "dark",
        "danger",
        "dangerous",
        "harass",
        "harassed",
        "harassment",
        "incident",
        "lighting",
        "lit",
        "police",
        "poor",
        "robbery",
        "safe",
        "safety",
        "scary",
        "secure",
        "suspicious",
        "threatened",
        "unsafe",
        "violence",
        "followed",
    }
)


def analyze_review_text(text: str) -> dict[str, Any]:
    """Return lexical labels and heuristic confidence for one real submitted text."""
    if not isinstance(text, str) or not text.strip():
        raise ValueError("Review text must be a non-empty string.")
    if len(text) > MAX_REVIEW_LENGTH:
        raise ValueError("Review text must not exceed 500 characters.")

    tokens = _TOKEN_PATTERN.findall(text.casefold())
    counts = Counter(tokens)
    positive_count = sum(counts[word] for word in _POSITIVE_WORDS)
    negative_count = sum(counts[word] for word in _NEGATIVE_WORDS)
    sentiment_evidence = positive_count + negative_count

    if sentiment_evidence == 0:
        sentiment_label = ReviewSentimentLabel.UNCERTAIN
        sentiment_score = 0.0
        sentiment_confidence = 0.0
    else:
        sentiment_score = round(
            (positive_count - negative_count) / sentiment_evidence,
            4,
        )
        if sentiment_score > 0.2:
            sentiment_label = ReviewSentimentLabel.POSITIVE
        elif sentiment_score < -0.2:
            sentiment_label = ReviewSentimentLabel.NEGATIVE
        else:
            sentiment_label = ReviewSentimentLabel.NEUTRAL
        sentiment_confidence = round(
            min(0.9, 0.5 + 0.1 * min(abs(positive_count - negative_count), 4)),
            2,
        )

    safety_matches = sum(counts[word] for word in _SAFETY_WORDS)
    safety_relevant = safety_matches > 0
    safety_relevance_confidence = (
        round(min(0.95, 0.55 + 0.1 * min(safety_matches - 1, 4)), 2)
        if safety_relevant
        else 0.5
    )

    return {
        "sentiment": {
            "label": sentiment_label.value,
            "score": sentiment_score,
            "confidence": sentiment_confidence,
        },
        "safetyRelevance": {
            "isRelevant": safety_relevant,
            "confidence": safety_relevance_confidence,
        },
        "modelName": MODEL_NAME,
        "modelVersion": MODEL_VERSION,
    }
