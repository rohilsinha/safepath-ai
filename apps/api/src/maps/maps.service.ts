import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DestinationSearchDto,
  RouteSearchDto,
} from './dto/route-search.dto';
import {
  SafetyAssessmentResponse,
  SafetyScoringService,
  unavailableSafetyAssessment,
} from './safety-scoring.service';
import { CommunityReportsService } from '../community-reports/community-reports.service';
import { matchDemoEvidenceToRoutes } from './demo-safety-evidence';

interface MapboxFeature {
  id?: string;
  properties?: {
    mapbox_id?: string;
    name?: string;
    name_preferred?: string;
    full_address?: string;
    place_formatted?: string;
    coordinates?: {
      longitude?: number;
      latitude?: number;
    };
  };
  geometry?: {
    type?: string;
    coordinates?: number[];
  };
}

interface MapboxGeocodingResponse {
  features?: MapboxFeature[];
}

interface MapboxRoute {
  distance?: number;
  duration?: number;
  geometry?: {
    type?: string;
    coordinates?: number[][];
  };
}

interface MapboxDirectionsResponse {
  routes?: MapboxRoute[];
}

export interface PlaceSearchResult {
  id: string;
  name: string;
  fullAddress: string;
  latitude: number;
  longitude: number;
}

export interface Coordinate {
  latitude: number;
  longitude: number;
}

export interface RouteAlternative {
  id: string;
  index: number;
  safetyRank: number | null;
  distanceMeters: number;
  durationSeconds: number;
  geometry: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  safetyAssessment: SafetyAssessmentResponse;
}

export interface RouteSearchResponse {
  origin: Coordinate;
  destination: Coordinate;
  routes: RouteAlternative[];
}

@Injectable()
export class MapsService {
  private readonly mapboxBaseUrl = 'https://api.mapbox.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly safetyScoringService: SafetyScoringService,
    private readonly communityReportsService: CommunityReportsService,
  ) {}

  async searchPlaces(
    query: DestinationSearchDto,
  ): Promise<PlaceSearchResult[]> {
    const url = new URL(`${this.mapboxBaseUrl}/search/searchbox/v1/forward`);
    url.searchParams.set('q', query.query);
    url.searchParams.set('limit', '5');
    url.searchParams.set(
      'types',
      'poi,address,place,city,locality,neighborhood,district,region,street',
    );
    if (
      query.proximityLatitude !== undefined &&
      query.proximityLongitude !== undefined
    ) {
      url.searchParams.set(
        'proximity',
        `${query.proximityLongitude},${query.proximityLatitude}`,
      );
    }
    url.searchParams.set('access_token', this.getAccessToken());

    const result = (await this.requestMapbox(url)) as MapboxGeocodingResponse;
    if (!result || !Array.isArray(result.features)) {
      throw new BadGatewayException('Mapbox returned an invalid search response');
    }

    return result.features.map((feature) => {
      if (!feature || typeof feature !== 'object') {
        throw new BadGatewayException(
          'Mapbox returned an invalid search result',
        );
      }
      const properties = feature.properties;
      const coordinates =
        properties?.coordinates ??
        (feature.geometry?.coordinates
          ? {
              longitude: feature.geometry.coordinates[0],
              latitude: feature.geometry.coordinates[1],
            }
          : undefined);
      const name =
        properties?.name_preferred ??
        properties?.name ??
        properties?.full_address;
      const id = feature.id ?? properties?.mapbox_id;
      const longitude = coordinates?.longitude;
      const latitude = coordinates?.latitude;
      const fullAddress =
        properties?.full_address ?? properties?.place_formatted ?? name;

      if (
        typeof id !== 'string' ||
        typeof name !== 'string' ||
        typeof fullAddress !== 'string' ||
        (feature.geometry?.type !== undefined &&
          feature.geometry.type !== 'Point') ||
        typeof longitude !== 'number' ||
        !Number.isFinite(longitude) ||
        typeof latitude !== 'number' ||
        !Number.isFinite(latitude) ||
        longitude < -180 ||
        longitude > 180 ||
        latitude < -90 ||
        latitude > 90
      ) {
        throw new BadGatewayException(
          'Mapbox returned an invalid search result',
        );
      }

      return {
        id,
        name,
        fullAddress,
        longitude,
        latitude,
      };
    });
  }

  async calculateRoutes(
    request: RouteSearchDto,
  ): Promise<RouteSearchResponse> {
    const { origin, destination } = request;
    const coordinates = [
      `${origin.longitude},${origin.latitude}`,
      `${destination.longitude},${destination.latitude}`,
    ].join(';');
    const url = new URL(
      `${this.mapboxBaseUrl}/directions/v5/mapbox/driving/${coordinates}`,
    );
    url.searchParams.set('alternatives', 'true');
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'false');
    url.searchParams.set('access_token', this.getAccessToken());

    const result = (await this.requestMapbox(url)) as MapboxDirectionsResponse;
    if (!result || !Array.isArray(result.routes)) {
      throw new BadGatewayException(
        'Mapbox returned an invalid directions response',
      );
    }
    if (result.routes.length === 0) {
      throw new NotFoundException('No routes were found for these coordinates');
    }

    const routes = result.routes.map(
      (route, index): Omit<
        RouteAlternative,
        'safetyAssessment' | 'safetyRank'
      > => {
        if (!route || typeof route !== 'object') {
          throw new BadGatewayException(
            'Mapbox returned an invalid route alternative',
          );
        }
        const routeCoordinates = route.geometry?.coordinates;
        if (
          !Number.isFinite(route.distance) ||
          route.distance! < 0 ||
          !Number.isFinite(route.duration) ||
          route.duration! < 0 ||
          route.geometry?.type !== 'LineString' ||
          !Array.isArray(routeCoordinates) ||
          routeCoordinates.length === 0 ||
          routeCoordinates.some(
            (coordinate) =>
              !Array.isArray(coordinate) ||
              coordinate.length !== 2 ||
              !Number.isFinite(coordinate[0]) ||
              !Number.isFinite(coordinate[1]),
          )
        ) {
          throw new BadGatewayException(
            'Mapbox returned an invalid route alternative',
          );
        }

        return {
          id: `route-${index + 1}`,
          index,
          distanceMeters: route.distance!,
          durationSeconds: route.duration!,
          geometry: {
            type: 'LineString',
            coordinates: routeCoordinates.map(
              (coordinate): [number, number] => [
                coordinate[0],
                coordinate[1],
              ],
            ),
          },
        };
      },
    );

    const communityEvidence =
      await this.communityReportsService.evidenceForRoutes(
        routes.map((route) => ({
          id: route.id,
          coordinates: route.geometry.coordinates,
        })),
      );
    const demoEvidence = matchDemoEvidenceToRoutes(
      routes.map((route) => ({
        id: route.id,
        coordinates: route.geometry.coordinates,
      })),
    );
    const assessments = await this.safetyScoringService.assessRoutes(
      routes.map((route) => route.id),
      communityEvidence,
      demoEvidence.riskValuesByRoute,
    );
    const assessmentByRouteId = new Map(
      assessments.map((assessment) => [
        assessment.routeId,
        {
          ...assessment,
          demoEvidence: demoEvidence.evidenceByRoute[assessment.routeId] ?? [],
          isDemo:
            assessment.status === 'complete' &&
            (demoEvidence.evidenceByRoute[assessment.routeId]?.length ?? 0) > 0,
        },
      ]),
    );
    const rankByRouteId = new Map(
      routes
        .filter((route) => {
          const assessment = assessmentByRouteId.get(route.id);
          return assessment?.status === 'complete' && assessment.score !== null;
        })
        .sort((left, right) => {
          const leftScore = assessmentByRouteId.get(left.id)!.score!;
          const rightScore = assessmentByRouteId.get(right.id)!.score!;
          return rightScore - leftScore || left.index - right.index;
        })
        .map((route, index) => [route.id, index + 1]),
    );

    return {
      origin,
      destination,
      routes: routes.map((route) => ({
        ...route,
        safetyRank: rankByRouteId.get(route.id) ?? null,
        safetyAssessment:
          assessmentByRouteId.get(route.id) ??
          unavailableSafetyAssessment(route.id),
      })),
    };
  }

  private getAccessToken(): string {
    const accessToken = this.configService
      .get<string>('MAPBOX_ACCESS_TOKEN')
      ?.trim();
    if (!accessToken) {
      throw new ServiceUnavailableException(
        'Mapbox services are not configured',
      );
    }

    return accessToken;
  }

  private async requestMapbox(url: URL): Promise<unknown> {
    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    } catch {
      throw new BadGatewayException('Could not connect to Mapbox');
    }

    if (!response.ok) {
      if (response.status === 429) {
        throw new ServiceUnavailableException(
          'Mapbox request limit reached; try again later',
        );
      }
      throw new BadGatewayException('Mapbox request failed');
    }

    try {
      return await response.json();
    } catch {
      throw new BadGatewayException('Mapbox returned an invalid response');
    }
  }
}
