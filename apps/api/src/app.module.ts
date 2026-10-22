import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { CommunityReportsModule } from './community-reports/community-reports.module';
import { HealthModule } from './health/health.module';
import { MapsModule } from './maps/maps.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    HealthModule,
    AuthModule,
    CommunityReportsModule,
    MapsModule,
  ],
})
export class AppModule {}
