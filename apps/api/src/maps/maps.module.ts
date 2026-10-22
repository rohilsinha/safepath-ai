import { Module } from '@nestjs/common';
import { CommunityReportsModule } from '../community-reports/community-reports.module';
import { MapsController } from './maps.controller';
import { MapsService } from './maps.service';
import { SafetyScoringService } from './safety-scoring.service';

@Module({
  imports: [CommunityReportsModule],
  controllers: [MapsController],
  providers: [MapsService, SafetyScoringService],
})
export class MapsModule {}
