import { IsString } from 'class-validator';

export class RemoveProductDto {
  @IsString()
  product_id!: string;
}
