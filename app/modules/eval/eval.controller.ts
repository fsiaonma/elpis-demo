import { Controller, Get } from '@nestjs/common';
import { BaseController } from '@fsiaonma/elpis/nest';
import { EvalService } from './eval.service';

@Controller('api/eval')
export class EvalController extends BaseController {
  constructor(private readonly evalService: EvalService) {
    super();
  }

  @Get('report')
  getReport() {
    return this.success(this.evalService.getReport());
  }
}
