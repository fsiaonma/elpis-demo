import { Injectable } from '@nestjs/common';
import { ConfigService } from '@fsiaonma/elpis/nest';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class EvalService {
  constructor(private readonly configService: ConfigService) {}

  getReport() {
    const configuredPath = this.configService.get('ai.eval.reportPath') as string | undefined;
    const reportPath = path.resolve(process.cwd(), configuredPath || './data/eval/report.json');

    if (!fs.existsSync(reportPath)) {
      return {
        suite: '',
        ranAt: null,
        results: [],
        passCount: 0,
        failCount: 0,
      };
    }

    return JSON.parse(fs.readFileSync(reportPath, 'utf-8'));
  }
}
