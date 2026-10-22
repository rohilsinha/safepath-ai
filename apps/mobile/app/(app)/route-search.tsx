import { useRef, useState } from 'react';
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
  DestinationSearchResult,
  searchDestinations,
} from '../../src/api';
import { AppTitle, BackButton, Card, PrimaryButton, Screen } from '../../src/components/ui';
import { colors } from '../../src/theme';
import { useCurrentLocation } from '../../src/use-current-location';

type SearchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'results'; destinations: DestinationSearchResult[] }
  | { status: 'no-results' }
  | { status: 'error'; message: string };

export default function RouteSearchScreen() {
  const [query, setQuery] = useState('');
  const [searchState, setSearchState] = useState<SearchState>({ status: 'idle' });
  const [selectionMessage, setSelectionMessage] = useState<string>();
  const { locationState, requestLocation } = useCurrentLocation();
  const searchRequestId = useRef(0);

  async function search() {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      searchRequestId.current += 1;
      setSearchState({ status: 'error', message: 'Enter a destination to search.' });
      return;
    }

    const requestId = ++searchRequestId.current;
    setSearchState({ status: 'loading' });
    try {
      const proximity =
        locationState.status === 'location-available'
          ? locationState.coordinates
          : undefined;
      const destinations = await searchDestinations(trimmedQuery, proximity);
      if (requestId === searchRequestId.current) {
        setSearchState(
          destinations.length > 0
            ? { status: 'results', destinations }
            : { status: 'no-results' },
        );
      }
    } catch (error) {
      if (requestId === searchRequestId.current) {
        setSearchState({
          status: 'error',
          message:
            error instanceof ApiError && error.status >= 500
              ? 'Destination search is temporarily unavailable. Please try again.'
              : error instanceof Error
                ? error.message
                : 'Unable to search destinations. Please try again.',
        });
      }
    }
  }

  function selectDestination(destination: DestinationSearchResult) {
    if (locationState.status !== 'location-available') {
      setSelectionMessage(
        locationState.status === 'permission-denied'
          ? 'Location permission is required to calculate a route. Allow location access and try again.'
          : 'Your current location is not available yet. Please wait or try again.',
      );
      return;
    }

    setSelectionMessage(undefined);
    router.push({
      pathname: '/route-results',
      params: {
        destinationId: destination.id,
        destinationName: destination.name,
        destinationAddress: destination.fullAddress,
        destinationLatitude: String(destination.latitude),
        destinationLongitude: String(destination.longitude),
        originLatitude: String(locationState.coordinates.latitude),
        originLongitude: String(locationState.coordinates.longitude),
      },
    });
  }

  return (
    <Screen>
      <BackButton onPress={() => router.back()} />
      <AppTitle
        eyebrow="Route search"
        title="Choose a destination"
        subtitle="Allow access to your current location, then choose a real destination to calculate routes."
      />

      <Card style={styles.locationCard}>
        <Text style={styles.locationTitle}>CURRENT LOCATION</Text>
        {locationState.status === 'requesting-permission' ? (
          <View style={styles.locationStatus}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.locationDetail}>Requesting foreground location permission…</Text>
          </View>
        ) : null}
        {locationState.status === 'permission-denied' ? (
          <>
            <Text accessibilityRole="alert" style={styles.locationError}>
              Location permission is required to calculate a route. Enable location access to continue.
            </Text>
            <PrimaryButton label="Allow location access" tone="outline" onPress={requestLocation} />
          </>
        ) : null}
        {locationState.status === 'location-loading' ? (
          <View style={styles.locationStatus}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.locationDetail}>Getting your current device location…</Text>
          </View>
        ) : null}
        {locationState.status === 'location-unavailable' ? (
          <>
            <Text accessibilityRole="alert" style={styles.locationError}>
              {locationState.message}
            </Text>
            <PrimaryButton label="Try location again" tone="outline" onPress={requestLocation} />
          </>
        ) : null}
        {locationState.status === 'location-available' ? (
          <Text style={styles.locationDetail}>Your current device location is ready.</Text>
        ) : null}
      </Card>

      <View style={styles.searchSection}>
        <Text style={styles.label}>Destination</Text>
        <TextInput
          accessibilityLabel="Destination"
          autoCorrect={false}
          onChangeText={(value) => {
            searchRequestId.current += 1;
            setQuery(value);
            setSearchState({ status: 'idle' });
          }}
          onSubmitEditing={search}
          placeholder="Search an area or landmark"
          placeholderTextColor="#7C8B91"
          returnKeyType="search"
          style={styles.input}
          value={query}
        />
        <PrimaryButton
          disabled={searchState.status === 'loading'}
          label={searchState.status === 'loading' ? 'Searching…' : 'Search destinations'}
          onPress={search}
        />
      </View>

      {searchState.status === 'idle' ? (
        <Text style={styles.note}>Search for a place, area, or landmark.</Text>
      ) : null}
      {searchState.status === 'loading' ? (
        <View accessibilityLiveRegion="polite" style={styles.stateMessage}>
          <ActivityIndicator color={colors.primary} />
          <Text style={styles.note}>Searching real destinations…</Text>
        </View>
      ) : null}
      {searchState.status === 'no-results' ? (
        <Text style={styles.note}>No destinations found. Try a different search.</Text>
      ) : null}
      {searchState.status === 'error' ? (
        <Text accessibilityRole="alert" style={styles.error}>{searchState.message}</Text>
      ) : null}
      {selectionMessage ? (
        <Text accessibilityRole="alert" style={styles.error}>{selectionMessage}</Text>
      ) : null}
      {searchState.status === 'results' ? (
        <View style={styles.results}>
          <Text style={styles.resultsTitle}>Search results</Text>
          {searchState.destinations.map((destination) => (
            <Pressable
              accessibilityLabel={`${destination.name}, ${destination.fullAddress}`}
              accessibilityRole="button"
              key={destination.id}
              onPress={() => selectDestination(destination)}
            >
              <Card style={styles.resultCard}>
                <Text style={styles.resultName}>{destination.name}</Text>
                <Text style={styles.resultAddress}>{destination.fullAddress}</Text>
              </Card>
            </Pressable>
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  searchSection: { gap: 10 },
  locationCard: { gap: 10 },
  locationTitle: { color: colors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  locationStatus: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  locationDetail: { color: colors.muted, fontSize: 14, lineHeight: 20, flexShrink: 1 },
  locationError: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  label: { color: colors.ink, fontWeight: '700' },
  input: {
    minHeight: 54,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    paddingHorizontal: 15,
    fontSize: 16,
    color: colors.ink,
  },
  stateMessage: { alignItems: 'center', gap: 10 },
  note: { color: colors.muted, fontSize: 13, textAlign: 'center', lineHeight: 19 },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  results: { gap: 10 },
  resultsTitle: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  resultCard: { gap: 6 },
  resultName: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  resultAddress: { color: colors.muted, fontSize: 13, lineHeight: 19 },
});
