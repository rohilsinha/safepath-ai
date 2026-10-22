import { Transform, Type } from 'class-transformer';
import {
  IsDefined,
  IsNumber,
  IsObject,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  IsNotEmptyObject,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class DestinationSearchDto {
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  @Matches(/^[^;]+$/)
  query!: string;

  @ValidateIf(
    (query: DestinationSearchDto) =>
      query.proximityLatitude !== undefined ||
      query.proximityLongitude !== undefined,
  )
  @IsDefined()
  @Transform(({ value }) =>
    value === '' ? Number.NaN : Number(value),
  )
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  proximityLatitude?: number;

  @ValidateIf(
    (query: DestinationSearchDto) =>
      query.proximityLatitude !== undefined ||
      query.proximityLongitude !== undefined,
  )
  @IsDefined()
  @Transform(({ value }) =>
    value === '' ? Number.NaN : Number(value),
  )
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  proximityLongitude?: number;
}

export class RouteCoordinateDto {
  @Transform(({ value }) =>
    value === '' ? Number.NaN : Number(value),
  )
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Transform(({ value }) =>
    value === '' ? Number.NaN : Number(value),
  )
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-180)
  @Max(180)
  longitude!: number;
}

export class RouteSearchDto {
  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  origin!: RouteCoordinateDto;

  @IsDefined()
  @IsObject()
  @IsNotEmptyObject()
  @ValidateNested()
  @Type(() => RouteCoordinateDto)
  destination!: RouteCoordinateDto;
}
