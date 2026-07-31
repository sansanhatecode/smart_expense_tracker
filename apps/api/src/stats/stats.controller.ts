import { Controller, Get, Query } from '@nestjs/common';
import {
  statsQuerySchema,
  trendQuerySchema,
  type CategoryBreakdownDto,
  type StatsQuery,
  type SummaryDto,
  type TrendDto,
  type TrendQuery,
} from '@expense/shared';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { StatsService } from './stats.service';

@Controller('api/stats')
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('summary')
  summary(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(statsQuerySchema)) query: StatsQuery,
  ): Promise<SummaryDto> {
    return this.stats.summary(userId, query);
  }

  @Get('by-category')
  byCategory(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(statsQuerySchema)) query: StatsQuery,
  ): Promise<CategoryBreakdownDto> {
    return this.stats.byCategory(userId, query);
  }

  @Get('trend')
  trend(
    @CurrentUserId() userId: string,
    @Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery,
  ): Promise<TrendDto> {
    return this.stats.trend(userId, query);
  }
}
