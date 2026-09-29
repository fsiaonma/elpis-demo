import { IsString } from 'class-validator';

export class GetProductDto {
  @IsString()
  product_id!: string;
}
