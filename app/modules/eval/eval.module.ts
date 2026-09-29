import { Module } from '@nestjs/common';
import { RagModule } from '@fsiaonma/elpis/nest';
import { EvalController } from './eval.controller';
import { EvalService } from './eval.service';

@Module({
  imports: [RagModule],
  controllers: [EvalController],
  providers: [EvalService],
})
export class EvalModule {}
