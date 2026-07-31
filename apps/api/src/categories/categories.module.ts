import { Module } from '@nestjs/common';
import { CategoriesController, CategoryRulesController } from './categories.controller';
import { CategoriesService } from './categories.service';

@Module({
  controllers: [CategoriesController, CategoryRulesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
