import { IsString } from 'class-validator';

export class GetUserDto {
  @IsString()
  user_id!: string;
}
