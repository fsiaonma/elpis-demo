import { IsOptional, IsString } from 'class-validator';

export class GetUserListDto {
  @IsOptional()
  @IsString()
  username?: string;

  @IsOptional()
  @IsString()
  nickname?: string;

  @IsOptional()
  @IsString()
  sex?: string;

  @IsOptional()
  @IsString()
  create_time_start?: string;

  @IsOptional()
  @IsString()
  create_time_end?: string;

  @IsString()
  page!: string;

  @IsString()
  size!: string;
}
