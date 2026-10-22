import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import type { CommunityReviewAnalysisResponse } from '../api';
import {
  formatSentimentScore,
  getReviewAnalysisPresentation,
} from '../review-analysis';
import { Card } from './ui';

export function ReviewAnalysisCard({
  analysis,
  description,
}: {
  analysis: CommunityReviewAnalysisResponse | null;
  description?: string;
}) {
  const presentation = getReviewAnalysisPresentation(analysis);
  const isPending = presentation.kind === 'pending';
  const sentimentScore =
    analysis?.status === 'COMPLETED'
      ? formatSentimentScore(analysis.sentimentScore)
      : null;
  return (
    <Card
      style={StyleSheet.flatten([
        styles.analysisCard,
        presentation.kind === 'positive' && styles.analysisPositive,
        presentation.kind === 'negative' && styles.analysisNegative,
      ])}
    >
      <View accessibilityLiveRegion="polite" style={styles.analysisHeader}>
        {isPending ? (
          <ActivityIndicator color="#DCE5EA" />
        ) : (
          <View
            accessible
            accessibilityLabel={
              presentation.kind === 'positive'
                ? 'Positive result'
                : presentation.kind === 'negative'
                  ? 'Negative result'
                  : 'Neutral result'
            }
            style={[
              styles.analysisIcon,
              presentation.kind === 'positive' && styles.positiveIcon,
              presentation.kind === 'negative' && styles.negativeIcon,
              (presentation.kind === 'unclear' || presentation.kind === 'failed') &&
                styles.neutralIcon,
            ]}
          >
            <Text
              style={[
                styles.analysisIconText,
                presentation.kind === 'negative' && styles.warningIconText,
              ]}
            >
              {presentation.icon}
            </Text>
          </View>
        )}
        <Text style={styles.analysisTitle}>{presentation.title}</Text>
      </View>
      {description ? (
        <Text style={styles.analysisDescription}>{description}</Text>
      ) : null}
      {sentimentScore !== null ? (
        <View style={styles.sentimentScoreBlock}>
          <Text style={styles.sentimentScoreLabel}>Sentiment score</Text>
          <Text accessibilityLabel={`Sentiment score ${sentimentScore} on a scale from minus one to plus one`} style={styles.sentimentScore}>
            {sentimentScore}
          </Text>
          <Text style={styles.sentimentScoreScale}>
            Lexical polarity: −1 negative · 0 neutral · +1 positive
          </Text>
        </View>
      ) : null}
      <View style={styles.analysisDivider} />
      <View style={styles.analysisBadges}>
        {'badge' in presentation ? (
          <Text
            style={[
              styles.analysisBadge,
              presentation.kind === 'positive' && styles.positiveBadge,
              presentation.kind === 'negative' && styles.negativeBadge,
              presentation.kind === 'unclear' && styles.neutralBadge,
            ]}
          >
            {presentation.badge}
          </Text>
        ) : null}
        {'confidence' in presentation ? (
          <Text style={styles.confidenceBadge}>{presentation.confidence}</Text>
        ) : null}
      </View>
      {presentation.kind === 'failed' ? (
        <Text style={styles.analysisSupportText}>
          Your review was received and remains available. Its analysis could not be completed.
        </Text>
      ) : null}
      {presentation.kind === 'pending' ? (
        <Text style={styles.analysisSupportText}>
          Your review was received. Analysis is still in progress.
        </Text>
      ) : null}
      <Text style={styles.analysisDisclaimer}>
        Community-submitted and unverified; analysis is contextual and does not determine route safety.
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  analysisCard: {
    gap: 12,
    padding: 15,
    borderRadius: 18,
    backgroundColor: '#111D25',
    borderColor: '#30414B',
    shadowColor: '#000000',
    shadowOpacity: 0.16,
  },
  analysisPositive: { borderColor: '#27664B' },
  analysisNegative: { borderColor: '#85404A' },
  analysisHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  analysisIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  positiveIcon: { backgroundColor: '#173C30', borderColor: '#3B966F' },
  negativeIcon: {
    width: 0,
    height: 0,
    marginTop: -5,
    borderRadius: 0,
    borderWidth: 0,
    borderLeftWidth: 15,
    borderRightWidth: 15,
    borderBottomWidth: 27,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#C55A68',
  },
  neutralIcon: { backgroundColor: '#29343B', borderColor: '#61717A' },
  analysisIconText: { color: '#F5F8FA', fontSize: 17, fontWeight: '800' },
  warningIconText: { position: 'absolute', top: 4, left: -2, fontSize: 14 },
  analysisTitle: {
    flex: 1,
    color: '#F5F8FA',
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '800',
  },
  analysisDescription: { color: '#E4EBEF', fontSize: 14, lineHeight: 21 },
  sentimentScoreBlock: {
    alignSelf: 'flex-start',
    gap: 3,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    backgroundColor: '#1B2A33',
  },
  sentimentScoreLabel: { color: '#D7E1E6', fontSize: 12, fontWeight: '700' },
  sentimentScore: { color: '#F5F8FA', fontSize: 25, lineHeight: 30, fontWeight: '800' },
  sentimentScoreScale: { color: '#B7C5CC', fontSize: 11, lineHeight: 15 },
  analysisDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#40515B' },
  analysisBadges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  analysisBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '800',
  },
  positiveBadge: { color: '#BDF3D7', backgroundColor: '#1B4937' },
  negativeBadge: { color: '#FFD0D5', backgroundColor: '#512A32' },
  neutralBadge: { color: '#E0E7EB', backgroundColor: '#303D45' },
  confidenceBadge: {
    overflow: 'hidden',
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: '#E1EAF0',
    backgroundColor: '#263640',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '700',
  },
  analysisSupportText: { color: '#D7E1E6', fontSize: 13, lineHeight: 19 },
  analysisDisclaimer: { color: '#B7C5CC', fontSize: 12, lineHeight: 17 },
});
