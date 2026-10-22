import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ReportSeverity,
  SafetyReportCategory,
} from '@prisma/client';

const toNumber = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? Number(value) : value;

export class CreateCommunityReportDto {
  @Transform(toNumber)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  latitude!: number;

  @Transform(toNumber)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  longitude!: number;

  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 500)
  description!: string;

  @IsEnum(SafetyReportCategory)
  category!: SafetyReportCategory;

  @IsEnum(ReportSeverity)
  severity!: ReportSeverity;

  @IsDateString({ strict: true })
  occurredAt!: string;
}

export class CommunityReportAreaQueryDto {
  @Transform(toNumber)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  minLatitude!: number;

  @Transform(toNumber)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-90)
  @Max(90)
  maxLatitude!: number;

  @Transform(toNumber)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  minLongitude!: number;

  @Transform(toNumber)
  @IsNumber({ allowInfinity: false, allowNaN: false })
  @Min(-180)
  @Max(180)
  maxLongitude!: number;

  @IsOptional()
  @IsDateString({ strict: true })
  occurredAfter?: string;

  @IsOptional()
  @IsDateString({ strict: true })
  occurredBefore?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(10_000)
  offset = 0;
}
