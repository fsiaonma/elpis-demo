import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@fsiaonma/elpis/nest';
import { Request, Response } from 'express';
import * as jwt from 'jsonwebtoken';
import { IS_PUBLIC_KEY } from './public.decorator';

const WHITE_LIST = [
  '/view/auth/login',
  '/api/auth/login',
  '/api/auth/logout',
];

function getCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) {
    return undefined;
  }

  const cookieText = Array.isArray(cookieHeader)
    ? cookieHeader.join(';')
    : cookieHeader;

  for (const part of cookieText.split(';')) {
    const cookie = part.trim();
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }
    const key = cookie.slice(0, separatorIndex);
    if (key === name) {
      return decodeURIComponent(cookie.slice(separatorIndex + 1));
    }
  }

  return undefined;
}

@Injectable()
export class AuthTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const path = request.path;

    if (WHITE_LIST.includes(path)) {
      return true;
    }

    let isLogin = true;
    const token = getCookie(request, 'token');

    if (!token) {
      isLogin = false;
    } else {
      try {
        const jwtSecretKey = this.configService.get('jwtSecreKey') as string;
        const decoded = jwt.verify(token, jwtSecretKey) as { userId: string };
        request.userId = decoded.userId;
      } catch {
        isLogin = false;
      }
    }

    if (!isLogin) {
      response.cookie('token', '', {
        expires: new Date(0),
      });

      const url = request.originalUrl || request.url;
      if (url.indexOf('api') > -1) {
        throw new HttpException(
          {
            success: false,
            code: 50000,
            message: '请重新登录',
          },
          HttpStatus.OK,
        );
      }

      response.redirect(302, `/view/auth/login?callback=${url}`);
      throw new HttpException('', HttpStatus.FOUND);
    }

    return true;
  }
}
