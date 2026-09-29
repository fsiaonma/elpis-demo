import { Controller, Get, Post } from '@nestjs/common';
import {
  BaseController,
  ConfigService,
  RetrieverService,
} from '@fsiaonma/elpis/nest';
import * as path from 'path';
import { EvalService } from './eval.service';

@Controller('api/eval')
export class EvalController extends BaseController {
  constructor(
    private readonly evalService: EvalService,
    private readonly retrieverService: RetrieverService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  @Get('report')
  getReport() {
    return this.success(this.evalService.getReport());
  }

  @Post('ingest')
  async ingest() {
    const ai = this.configService.get('ai') as
      | { store?: { vector?: string | { fixturesPath?: string } } }
      | undefined;
    const vector = ai?.store?.vector;
    const fixturesPath =
      typeof vector === 'object' && typeof vector.fixturesPath === 'string'
        ? vector.fixturesPath
        : '';
    const dir = path.resolve(process.cwd(), fixturesPath);
    const result = await this.retrieverService.ingestFromDirectory(dir);
    return this.success(result);
  }
}
