import { useCallback, useEffect, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import {
  ApiError,
  CommunityReviewAnalysisResponse,
  RouteCoordinate,
  RouteSearchResponse,
  calculateRoutes,
} from '../../src/api';
import {
  AppTitle,
  BackButton,
  Card,
  PrimaryButton,
  Screen,
} from '../../src/components/ui';
import { ReviewAnalysisCard } from '../../src/components/ReviewAnalysisCard';
import { colors } from '../../src/theme';

type RouteState =
  | { status: 'awaiting-origin' }
  | { status: 'loading' }
  | { status: 'routes'; response: RouteSearchResponse }
  | { status: 'no-routes' }
  | { status: 'error'; message: string };

export default function RouteResultsScreen() {
  const params = useLocalSearchParams<{
    destinationId?: string | string[];
    destinationName?: string | string[];
    destinationAddress?: string | string[];
    destinationLatitude?: string | string[];
    destinationLongitude?: string | string[];
    originLatitude?: string | string[];
    originLongitude?: string | string[];
  }>();
  const destinationId = getSingleParam(params.destinationId);
  const destinationName = getSingleParam(params.destinationName);
  const destinationAddress = getSingleParam(params.destinationAddress);
  const destinationLatitude = parseCoordinate(params.destinationLatitude, -90, 90);
  const destinationLongitude = parseCoordinate(params.destinationLongitude, -180, 180);
  const originLatitude = parseCoordinate(params.originLatitude, -90, 90);
  const originLongitude = parseCoordinate(params.originLongitude, -180, 180);
  const hasDestination =
    Boolean(destinationId && destinationName && destinationAddress) &&
    destinationLatitude !== undefined &&
    destinationLongitude !== undefined;
  const hasOrigin = originLatitude !== undefined && originLongitude !== undefined;
  const destination: RouteCoordinate | undefined =
    destinationLatitude !== undefined && destinationLongitude !== undefined
    ? { latitude: destinationLatitude, longitude: destinationLongitude }
    : undefined;
  const [routeState, setRouteState] = useState<RouteState>({ status: 'awaiting-origin' });
  const [focusRefresh, setFocusRefresh] = useState(0);
  const firstFocus = useRef(true);

  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      setFocusRefresh((current) => current + 1);
    }, []),
  );

  useEffect(() => {
    if (
      !hasDestination ||
      !destination ||
      originLatitude === undefined ||
      originLongitude === undefined
    ) {
      setRouteState({ status: 'awaiting-origin' });
      return;
    }

    let active = true;
    setRouteState({ status: 'loading' });
    calculateRoutes(
      { latitude: originLatitude, longitude: originLongitude },
      destination,
    )
      .then((response) => {
        if (active) {
          setRouteState(
            response.routes.length > 0
              ? { status: 'routes', response }
              : { status: 'no-routes' },
          );
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setRouteState({
            status: 'error',
            message:
              error instanceof ApiError && error.status >= 500
                ? 'Route planning is temporarily unavailable. Please try again.'
                : error instanceof Error
                  ? error.message
                  : 'Unable to calculate routes. Please try again.',
          });
        }
      });

    return () => {
      active = false;
    };
  }, [
    destinationLatitude,
    destinationLongitude,
    hasDestination,
    hasOrigin,
    originLatitude,
    originLongitude,
    focusRefresh,
  ]);

  return (
    <Screen>
      <BackButton onPress={() => router.back()} />
      <AppTitle
        eyebrow="Route results"
        title={hasDestination ? `Routes to ${destinationName}` : 'Choose a destination'}
        subtitle={
          hasDestination
            ? destinationAddress
            : 'Search for a real destination before planning a route.'
        }
      />

      {hasDestination ? (
        <Card style={styles.destinationCard}>
          <Text style={styles.destinationLabel}>SELECTED DESTINATION</Text>
          <Text style={styles.destinationName}>{destinationName}</Text>
          <Text style={styles.destinationAddress}>{destinationAddress}</Text>
          <Text style={styles.coordinates}>
            {destinationLatitude}, {destinationLongitude}
          </Text>
        </Card>
      ) : null}

      {routeState.status === 'awaiting-origin' && hasDestination ? (
        <Card>
          <Text style={styles.pendingTitle}>A real starting location is needed</Text>
          <Text style={styles.pendingText}>
            Route calculation is paused until the app can provide your actual origin. No sample
            location or coordinates are used.
          </Text>
        </Card>
      ) : null}
      {routeState.status === 'loading' ? (
        <View style={styles.stateMessage}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.pendingText}>Calculating real route alternatives…</Text>
        </View>
      ) : null}
      {routeState.status === 'no-routes' ? (
        <Text style={styles.pendingText}>No routes were returned for these locations.</Text>
      ) : null}
      {routeState.status === 'error' ? (
        <Text accessibilityRole="alert" style={styles.error}>{routeState.message}</Text>
      ) : null}
      {routeState.status === 'routes' ? (
        <>
          <Card style={styles.endpointsCard}>
            <Text style={styles.destinationLabel}>ROUTE ENDPOINTS</Text>
            <Text style={styles.pendingText}>
              Origin: {routeState.response.origin.latitude}, {routeState.response.origin.longitude}
            </Text>
            <Text style={styles.pendingText}>
              Destination: {routeState.response.destination.latitude},{' '}
              {routeState.response.destination.longitude}
            </Text>
          </Card>
          <View style={styles.routeList}>
            {routeState.response.routes.map((route) => (
              <Card key={route.id} style={styles.routeCard}>
                <Text style={styles.routeTitle}>Route {route.index + 1}</Text>
                <Text style={styles.routeStats}>
                  {formatDistance(route.distanceMeters)} · {formatDuration(route.durationSeconds)}
                </Text>
                <Text style={styles.routeStats}>
                  {route.safetyRank === null
                    ? 'Not ranked · no assessable safety score'
                    : `Safety rank #${route.safetyRank} · higher demo score ranks first`}
                </Text>
                <View
                  accessibilityLabel={getAssessmentAccessibilityLabel(
                    route.safetyAssessment.status,
                    route.safetyAssessment.score,
                    route.safetyAssessment.riskLevel,
                  )}
                  style={styles.assessment}
                >
                  {route.safetyAssessment.status === 'complete' &&
                  route.safetyAssessment.score !== null ? (
                    <>
                      <Text style={styles.assessmentTitle}>
                        {route.safetyAssessment.isDemo ? 'DEMO · ' : ''}
                        Safety Score: {route.safetyAssessment.score}/100 ·{' '}
                        {formatRiskLevel(route.safetyAssessment.riskLevel)}
                      </Text>
                    </>
                  ) : (
                    <Text style={styles.assessmentTitle}>Safety score unavailable</Text>
                  )}
                </View>
                {route.safetyAssessment.evidence.map((evidence) => {
                  const analysis = evidence.reviewAnalysis;
                  if (
                    evidence.category !== 'community_reports' ||
                    !analysis ||
                    !analysis.safetyRelevant
                  ) {
                    return null;
                  }
                  const persistedAnalysis: CommunityReviewAnalysisResponse = {
                    status: 'COMPLETED',
                    sentimentLabel: analysis.sentimentLabel,
                    sentimentScore: analysis.sentimentScore,
                    safetyRelevant: analysis.safetyRelevant,
                    sentimentConfidence: analysis.sentimentConfidence,
                    safetyRelevanceConfidence: analysis.safetyRelevanceConfidence,
                    modelName: analysis.modelName,
                    modelVersion: analysis.modelVersion,
                    createdAt: analysis.analyzedAt,
                  };
                  return (
                    <ReviewAnalysisCard
                      key={`review-analysis-${evidence.id}`}
                      analysis={persistedAnalysis}
                    />
                  );
                })}
              </Card>
            ))}
          </View>
        </>
      ) : null}

      <PrimaryButton
        label="Start a new search"
        tone="outline"
        onPress={() => router.replace('/route-search')}
      />
    </Screen>
  );
}

function getSingleParam(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseCoordinate(
  value: string | string[] | undefined,
  minimum: number,
  maximum: number,
): number | undefined {
  const parameter = getSingleParam(value);
  const normalizedParameter = parameter?.trim();
  if (!normalizedParameter) {
    return undefined;
  }
  const coordinate = Number(normalizedParameter);
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum
    ? coordinate
    : undefined;
}

function formatDistance(distanceMeters: number): string {
  return distanceMeters >= 1000
    ? `${(distanceMeters / 1000).toFixed(1)} km`
    : `${Math.round(distanceMeters)} m`;
}

function formatDuration(durationSeconds: number): string {
  const minutes = Math.round(durationSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return hours > 0 ? `${hours} hr ${remainingMinutes} min` : `${minutes} min`;
}

function formatRiskLevel(riskLevel: string): string {
  switch (riskLevel) {
    case 'low':
      return 'Low risk';
    case 'moderate':
      return 'Moderate risk';
    case 'high':
      return 'High risk';
    case 'very_high':
      return 'Very high risk';
    default:
      return 'Insufficient data';
  }
}

function getAssessmentAccessibilityLabel(
  status: string,
  score: number | null,
  riskLevel: string,
): string {
  if (status === 'complete' && score !== null) {
    return `Safety score ${score} out of 100, ${formatRiskLevel(riskLevel)}`;
  }
  return 'Safety score unavailable';
}

const styles = StyleSheet.create({
  destinationCard: { gap: 6 },
  destinationLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
  },
  destinationName: { color: colors.ink, fontSize: 17, fontWeight: '800', marginTop: 3 },
  destinationAddress: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  coordinates: { color: colors.muted, fontSize: 12, marginTop: 4 },
  endpointsCard: { gap: 7 },
  pendingTitle: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  pendingText: { color: colors.muted, fontSize: 14, lineHeight: 21 },
  stateMessage: { alignItems: 'center', gap: 10 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  routeList: { gap: 12 },
  routeCard: { gap: 8 },
  routeTitle: { color: colors.ink, fontSize: 17, fontWeight: '800' },
  routeStats: { color: colors.muted, fontSize: 14, fontWeight: '700' },
  assessment: { gap: 5, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  assessmentTitle: { color: colors.ink, fontSize: 14, fontWeight: '800' },
});
