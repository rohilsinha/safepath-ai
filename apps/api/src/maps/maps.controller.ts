import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  ValidationPipe,
} from '@nestjs/common';
import {
  DestinationSearchDto,
  RouteSearchDto,
} from './dto/route-search.dto';
import {
  MapsService,
  PlaceSearchResult,
  RouteSearchResponse,
} from './maps.service';

@Controller('maps')
export class MapsController {
  constructor(private readonly mapsService: MapsService) {}

  @Get('search')
  search(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: DestinationSearchDto,
  ): Promise<PlaceSearchResult[]> {
    return this.mapsService.searchPlaces(query);
  }

  @Post('routes')
  routes(
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    request: RouteSearchDto,
  ): Promise<RouteSearchResponse> {
    return this.mapsService.calculateRoutes(request);
  }
}
