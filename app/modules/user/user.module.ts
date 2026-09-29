import { Module } from '@nestjs/common';
import { ExtendModule } from '@fsiaonma/elpis/nest';
import { StatusProvider } from './status.provider';
import { UserController } from './user.controller';
import { UserService } from './user.service';

@Module({
  imports: [ExtendModule],
  controllers: [UserController],
  providers: [UserService, StatusProvider],
  exports: [UserService],
})
export class UserModule {}
