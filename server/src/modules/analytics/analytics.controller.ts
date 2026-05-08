import { Controller, Get, Query, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Analytics')
@ApiBearerAuth()
@Controller('analytics')
export class AnalyticsController {
  constructor(private service: AnalyticsService) {}

  @Get('dashboard')
  dashboard(@CurrentUser('orgId') orgId: string) {
    return this.service.getDashboard(orgId);
  }

  @Get('revenue')
  revenue(
    @CurrentUser('orgId') orgId: string,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.service.getRevenue(orgId, year);
  }

  @Get('occupancy')
  occupancy(@CurrentUser('orgId') orgId: string) {
    return this.service.getOccupancy(orgId);
  }

  @Get('overdue')
  overdue(@CurrentUser('orgId') orgId: string) {
    return this.service.getOverdueSummary(orgId);
  }

  @Get('financial-report')
  financialReport(
    @CurrentUser('orgId') orgId: string,
    @Query('month', ParseIntPipe) month: number,
    @Query('year', ParseIntPipe) year: number,
  ) {
    return this.service.getFinancialReport(orgId, month, year);
  }
}
