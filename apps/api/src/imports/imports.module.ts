import { Module } from '@nestjs/common';
import { ImportsController } from './imports.controller';
import { ImportsRepository } from './imports.repository';
import { ImportsService } from './imports.service';

@Module({
  controllers: [ImportsController],
  providers: [ImportsService, ImportsRepository],
})
export class ImportsModule {}
