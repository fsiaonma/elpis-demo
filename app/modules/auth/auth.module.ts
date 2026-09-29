import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { UserModule } from '../user/user.module';
import { AuthController } from './auth.controller';
import { AuthTokenGuard } from './auth-token.guard';

@Module({
  imports: [UserModule],
  controllers: [AuthController],
  providers: [
    AuthTokenGuard,
    {
      provide: APP_GUARD,
      useExisting: AuthTokenGuard,
    },
  ],
})
export class AuthModule {}
