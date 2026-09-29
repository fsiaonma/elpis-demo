import { Injectable } from '@nestjs/common';

@Injectable()
export class StatusProvider {
  readonly NORMAL = 1;
  readonly DELETE = -1;
}
