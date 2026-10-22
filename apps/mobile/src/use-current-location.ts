import { useCallback, useEffect, useState } from 'react';
import * as Location from 'expo-location';
import { RouteCoordinate } from './api';

export type CurrentLocationState =
  | { status: 'requesting-permission' }
  | { status: 'permission-denied' }
  | { status: 'location-loading' }
  | { status: 'location-unavailable'; message: string }
  | { status: 'location-available'; coordinates: RouteCoordinate };

export function useCurrentLocation() {
  const [locationState, setLocationState] = useState<CurrentLocationState>({
    status: 'requesting-permission',
  });

  const requestLocation = useCallback(async () => {
    setLocationState({ status: 'requesting-permission' });

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        setLocationState({ status: 'permission-denied' });
        return;
      }

      setLocationState({ status: 'location-loading' });
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = position.coords;

      if (
        !Number.isFinite(latitude) ||
        latitude < -90 ||
        latitude > 90 ||
        !Number.isFinite(longitude) ||
        longitude < -180 ||
        longitude > 180
      ) {
        setLocationState({
          status: 'location-unavailable',
          message: 'Your device returned invalid location data. Please try again.',
        });
        return;
      }

      setLocationState({
        status: 'location-available',
        coordinates: { latitude, longitude },
      });
    } catch {
      setLocationState({
        status: 'location-unavailable',
        message: 'Unable to get your current location. Check device location services and try again.',
      });
    }
  }, []);

  useEffect(() => {
    void requestLocation();
  }, [requestLocation]);

  return { locationState, requestLocation };
}
