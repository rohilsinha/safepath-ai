import {
  Body,
  Delete,
  Controller,
  HttpCode,
  HttpStatus,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  ValidationPipe,
} from '@nestjs/common';
import {
  AuthenticatedRequest,
  JwtAuthGuard,
} from '../auth/guards/jwt-auth.guard';
import {
  CommunityReportAreaQueryDto,
  CreateCommunityReportDto,
} from './dto/community-report.dto';
import {
  CommunityReportResponse,
  CommunityReportsService,
} from './community-reports.service';

@Controller('safety-reports')
@UseGuards(JwtAuthGuard)
export class CommunityReportsController {
  constructor(private readonly reportsService: CommunityReportsService) {}

  @Post()
  create(
    @Req() request: AuthenticatedRequest,
    @Body(new ValidationPipe({ transform: true, whitelist: true }))
    body: CreateCommunityReportDto,
  ): Promise<CommunityReportResponse> {
    return this.reportsService.create(request.user!.sub, body);
  }

  @Get()
  listAccepted(
    @Query(new ValidationPipe({ transform: true, whitelist: true }))
    query: CommunityReportAreaQueryDto,
  ): ReturnType<CommunityReportsService['listAccepted']> {
    return this.reportsService.listAccepted(query);
  }

  @Get('mine')
  listMine(
    @Req() request: AuthenticatedRequest,
  ): Promise<CommunityReportResponse[]> {
    return this.reportsService.listMine(request.user!.sub);
  }

  @Get(':id')
  getOne(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<CommunityReportResponse> {
    return this.reportsService.findVisibleReport(id, request.user!.sub);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOwn(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
  ): Promise<void> {
    await this.reportsService.deleteOwnReport(id, request.user!.sub);
  }
}
