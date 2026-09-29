import { Module } from '@nestjs/common';
import { ExtendModule } from '@fsiaonma/elpis/nest';
import {
  JobController,
  ProjResumeController,
  ResumeAnalyzeController,
} from './resume.controller';
import { ResumeService } from './resume.service';
import { ResumeSessionToolsService } from './session-tools';

@Module({
  imports: [ExtendModule],
  controllers: [ResumeAnalyzeController, ProjResumeController, JobController],
  providers: [ResumeService, ResumeSessionToolsService],
})
export class ResumeModule {}
