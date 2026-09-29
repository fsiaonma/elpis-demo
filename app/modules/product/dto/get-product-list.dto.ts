import { IsOptional, IsString } from 'class-validator';

export class GetProductListDto {
  @IsOptional()
  @IsString()
  product_name?: string;

  @IsString()
  page!: string;

  @IsString()
  size!: string;
}
