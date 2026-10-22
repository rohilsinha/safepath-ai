"""Tests for the local lexical analyzer; all text here is test input only."""

import unittest

from services.ai.nlp_analyzer import (
    MODEL_NAME,
    MODEL_VERSION,
    analyze_review_text,
)


class ReviewAnalysisTests(unittest.TestCase):
    def test_positive_and_negative_text_return_structured_polarity(self) -> None:
        positive = analyze_review_text("The route felt safe and welcoming.")
        negative = analyze_review_text("The street was dark and unsafe.")

        self.assertEqual(positive["sentiment"]["label"], "POSITIVE")
        self.assertGreater(positive["sentiment"]["score"], 0)
        self.assertEqual(negative["sentiment"]["label"], "NEGATIVE")
        self.assertLess(negative["sentiment"]["score"], 0)

    def test_safety_relevance_is_separate_from_sentiment(self) -> None:
        result = analyze_review_text("The lighting was bright and felt safe.")

        self.assertTrue(result["safetyRelevance"]["isRelevant"])
        self.assertEqual(result["sentiment"]["label"], "POSITIVE")

    def test_unmatched_text_is_uncertain_and_not_safety_relevant(self) -> None:
        result = analyze_review_text("A quiet walk beside the river.")

        self.assertEqual(result["sentiment"]["label"], "UNCERTAIN")
        self.assertEqual(result["sentiment"]["score"], 0.0)
        self.assertFalse(result["safetyRelevance"]["isRelevant"])

    def test_outputs_are_versioned_and_confidences_are_bounded(self) -> None:
        result = analyze_review_text("Poor lighting made the road unsafe.")

        self.assertEqual(result["modelName"], MODEL_NAME)
        self.assertEqual(result["modelVersion"], MODEL_VERSION)
        self.assertTrue(0 <= result["sentiment"]["confidence"] <= 1)
        self.assertTrue(0 <= result["safetyRelevance"]["confidence"] <= 1)

    def test_empty_and_oversized_text_are_rejected(self) -> None:
        for text in ("  ", "x" * 501):
            with self.subTest(length=len(text)), self.assertRaises(ValueError):
                analyze_review_text(text)


if __name__ == "__main__":
    unittest.main()
