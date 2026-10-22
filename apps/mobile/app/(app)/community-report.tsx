import { useState } from 'react';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ApiError,
  CommunityReportCategory,
  CommunityReportResponse,
  CommunityReportSeverity,
  DestinationSearchResult,
  searchDestinations,
  submitCommunityReport,
} from '../../src/api';
import {
  AppTitle,
  BackButton,
  Card,
  PrimaryButton,
  Screen,
} from '../../src/components/ui';
import { colors } from '../../src/theme';

const categories: { value: CommunityReportCategory; label: string }[] = [
  { value: 'HARASSMENT', label: 'Harassment' },
  { value: 'UNSAFE_AREA', label: 'Unsafe area' },
  { value: 'POOR_LIGHTING', label: 'Poor lighting' },
  { value: 'SUSPICIOUS_ACTIVITY', label: 'Suspicious activity' },
  { value: 'OTHER', label: 'Other concern' },
];

const severities: CommunityReportSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

type PlaceSearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; places: DestinationSearchResult[] }
  | { status: 'no-results' }
  | { status: 'error'; message: string };

export default function CommunityReportScreen() {
  const [category, setCategory] = useState<CommunityReportCategory>('OTHER');
  const [severity, setSeverity] = useState<CommunityReportSeverity>('MEDIUM');
  const [description, setDescription] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString());
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeSearch, setPlaceSearch] = useState<PlaceSearchState>({ status: 'idle' });
  const [candidateLocation, setCandidateLocation] = useState<DestinationSearchResult>();
  const [selectedLocation, setSelectedLocation] = useState<DestinationSearchResult>();
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [submittedReport, setSubmittedReport] =
    useState<CommunityReportResponse | null>(null);
  const submitted = submittedReport !== null;

  const searchPlaces = async (): Promise<void> => {
    const query = placeQuery.trim();
    if (!query) {
      setPlaceSearch({ status: 'error', message: 'Enter the place or address of the incident.' });
      return;
    }

    setPlaceSearch({ status: 'loading' });
    try {
      const places = await searchDestinations(query);
      setPlaceSearch(places.length > 0 ? { status: 'results', places } : { status: 'no-results' });
    } catch (error) {
      setPlaceSearch({
        status: 'error',
        message:
          error instanceof ApiError && error.status >= 500
            ? 'Place search is temporarily unavailable. Please try again.'
            : error instanceof Error
              ? error.message
              : 'Unable to search places. Please try again.',
      });
    }
  };

  const sendReport = async (): Promise<void> => {
    if (!selectedLocation) {
      setMessage('Search for the incident place and confirm it before submitting.');
      return;
    }
    if (!description.trim() || description.trim().length > 500) {
      setMessage('Enter a description between 1 and 500 characters.');
      return;
    }
    if (Number.isNaN(Date.parse(occurredAt))) {
      setMessage('Enter the incident time as a valid ISO date and time.');
      return;
    }

    setSubmitting(true);
    setMessage('');
    try {
      const report = await submitCommunityReport({
        latitude: selectedLocation.latitude,
        longitude: selectedLocation.longitude,
        category,
        severity,
        description: description.trim(),
        occurredAt,
      });
      if (report.status === 'ACCEPTED' || report.status === 'APPROVED') {
        setSubmittedReport(report);
      }
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Unable to submit this report. Please try again.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <BackButton onPress={() => router.back()} />
      <AppTitle
        eyebrow="Community reports"
        title={submitted ? 'Report received' : 'Share a safety concern'}
        subtitle={
          submitted
            ? 'Your report is available immediately as community-submitted information. It is not a verified incident and does not create a safety score.'
            : 'Reports are unverified claims. Please share only what you observed; do not include names or other personal details.'
        }
      />
      {submitted ? (
        <>
          <Card><Text style={styles.body}>Thank you. No emergency services are contacted by this submission.</Text></Card>
          <PrimaryButton label="Manage my reports" tone="outline" onPress={() => router.push('/my-reports')} />
        </>
      ) : (
        <>
          <Card style={styles.form}>
            <Text style={styles.label}>Category</Text>
            <View style={styles.options}>
              {categories.map((item) => (
                <Choice
                  key={item.value}
                  label={item.label}
                  selected={category === item.value}
                  onPress={() => setCategory(item.value)}
                />
              ))}
            </View>
            <Text style={styles.label}>Perceived severity</Text>
            <Text style={styles.body}>This is your report, not a verified classification.</Text>
            <View style={styles.options}>
              {severities.map((item) => (
                <Choice
                  key={item}
                  label={item.toLowerCase()}
                  selected={severity === item}
                  onPress={() => setSeverity(item)}
                />
              ))}
            </View>
            <Text style={styles.label}>Where did the incident happen?</Text>
            <Text style={styles.body}>
              Search for the place or address you are reporting. Your device location is not used
              automatically.
            </Text>
            <TextInput
              accessibilityLabel="Incident place or address"
              autoCorrect={false}
              editable={placeSearch.status !== 'loading'}
              onChangeText={(value) => {
                setPlaceQuery(value);
                setPlaceSearch({ status: 'idle' });
                setCandidateLocation(undefined);
                setSelectedLocation(undefined);
              }}
              onSubmitEditing={() => void searchPlaces()}
              placeholder="Search an area, address, or landmark"
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={styles.input}
              value={placeQuery}
            />
            <PrimaryButton
              label={placeSearch.status === 'loading' ? 'Searching…' : 'Search places'}
              tone="outline"
              disabled={placeSearch.status === 'loading'}
              onPress={() => void searchPlaces()}
            />
            {placeSearch.status === 'loading' ? (
              <View style={styles.searchStatus}>
                <ActivityIndicator color={colors.primary} />
                <Text style={styles.body}>Searching for real places…</Text>
              </View>
            ) : null}
            {placeSearch.status === 'error' ? (
              <Text accessibilityRole="alert" style={styles.error}>{placeSearch.message}</Text>
            ) : null}
            {placeSearch.status === 'no-results' ? (
              <Text style={styles.body}>No places found. Try a more specific search.</Text>
            ) : null}
            {placeSearch.status === 'results' ? (
              <View style={styles.placeResults}>
                <Text style={styles.label}>Choose the incident place</Text>
                {placeSearch.places.map((place) => (
                  <Pressable
                    accessibilityLabel={`${place.name}, ${place.fullAddress}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: candidateLocation?.id === place.id }}
                    key={place.id}
                    onPress={() => {
                      setCandidateLocation(place);
                      setSelectedLocation(undefined);
                      setMessage('');
                    }}
                  >
                    <View
                      style={[
                        styles.placeResult,
                        candidateLocation?.id === place.id && styles.placeResultSelected,
                      ]}
                    >
                      <Text style={styles.placeName}>{place.name}</Text>
                      <Text style={styles.body}>{place.fullAddress}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {candidateLocation ? (
              <View style={styles.confirmCard}>
                <Text style={styles.label}>Confirm this is the place you are reviewing</Text>
                <Text style={styles.placeName}>{candidateLocation.name}</Text>
                <Text style={styles.body}>{candidateLocation.fullAddress}</Text>
                <Text style={styles.body}>
                  {candidateLocation.latitude.toFixed(5)}, {candidateLocation.longitude.toFixed(5)}
                </Text>
                <PrimaryButton
                  label="Confirm incident location"
                  onPress={() => {
                    setSelectedLocation(candidateLocation);
                    setMessage('');
                  }}
                />
              </View>
            ) : null}
            {selectedLocation ? (
              <Text accessibilityLiveRegion="polite" style={styles.confirmedLocation}>
                Confirmed: {selectedLocation.name} · {selectedLocation.fullAddress}
              </Text>
            ) : null}
            <Text style={styles.label}>What did you observe? (up to 500 characters)</Text>
            <TextInput
              accessibilityLabel="Report description"
              multiline
              maxLength={500}
              placeholder="Avoid personal names or identifying details"
              placeholderTextColor={colors.muted}
              style={styles.description}
              value={description}
              onChangeText={setDescription}
            />
            <Text style={styles.label}>Incident time (ISO date and time)</Text>
            <TextInput
              accessibilityLabel="Incident time"
              autoCapitalize="none"
              placeholder="2026-10-11T10:30:00.000Z"
              placeholderTextColor={colors.muted}
              style={styles.input}
              value={occurredAt}
              onChangeText={setOccurredAt}
            />
          </Card>
          {message ? <Text accessibilityRole="alert" style={styles.error}>{message}</Text> : null}
          <PrimaryButton
            label={submitting ? 'Submitting…' : 'Submit report'}
            onPress={() => void sendReport()}
            disabled={submitting || !selectedLocation}
          />
        </>
      )}
    </Screen>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.choice, selected && styles.choiceSelected]}
    >
      <Text style={[styles.choiceText, selected && styles.choiceTextSelected]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  form: { gap: 10 },
  options: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  label: { color: colors.ink, fontSize: 14, fontWeight: '800', marginTop: 5 },
  body: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  choice: { paddingHorizontal: 11, paddingVertical: 9, borderRadius: 12, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface },
  choiceSelected: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  choiceText: { color: colors.ink, fontWeight: '600', textTransform: 'capitalize' },
  choiceTextSelected: { color: colors.primaryDark, fontWeight: '800' },
  description: { minHeight: 108, textAlignVertical: 'top', borderRadius: 14, borderWidth: 1, borderColor: colors.line, padding: 13, color: colors.ink },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12, color: colors.ink },
  searchStatus: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  placeResults: { gap: 8 },
  placeResult: { gap: 4, padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 12 },
  placeResultSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  placeName: { color: colors.ink, fontSize: 15, fontWeight: '800' },
  confirmCard: { gap: 8, padding: 13, borderWidth: 1, borderColor: colors.primary, borderRadius: 14, backgroundColor: colors.primarySoft },
  confirmedLocation: { color: colors.primaryDark, fontSize: 13, lineHeight: 19, fontWeight: '700' },
  error: { color: colors.danger, lineHeight: 20 },
});
