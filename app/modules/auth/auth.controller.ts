import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { BaseController, ConfigService } from '@fsiaonma/elpis/nest';
import { Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { UserService } from '../user/user.service';
import { LoginDto } from './dto/login.dto';
import { Public } from './public.decorator';

@Controller('api/auth')
export class AuthController extends BaseController {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  @Public()
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const userItem = await this.userService.getByUsernameAndPassword(dto);

    if (!userItem) {
      return this.fail('账号或密码错误', 50000);
    }

    const jwtSecretKey = this.configService.get('jwtSecreKey') as string;
    const token = jwt.sign({ userId: userItem.user_id }, jwtSecretKey, {
      expiresIn: 60 * 60 * 24,
    });

    const expires = new Date();
    expires.setTime(expires.getTime() + 1000 * 60 * 60 * 24);
    res.cookie('token', token, {
      expires,
      httpOnly: true,
    });

    return this.success({
      nickname: userItem.nickname,
    });
  }

  @Public()
  @Get('logout')
  logout(@Res() res: Response) {
    res.cookie('token', '', {
      expires: new Date(0),
    });
    return res.redirect('/view/auth/login');
  }
}
