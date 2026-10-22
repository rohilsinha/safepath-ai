import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CommunityReportsController } from './community-reports.controller';
import { CommunityReportsService } from './community-reports.service';
import { ReviewAnalysisService } from './review-analysis.service';

@Module({
  imports: [AuthModule],
  controllers: [CommunityReportsController],
  providers: [CommunityReportsService, ReviewAnalysisService],
  exports: [CommunityReportsService],
})
export class CommunityReportsModule {}
