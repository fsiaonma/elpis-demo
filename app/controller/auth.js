module.exports = (app) => {
  const jwt = require('jsonwebtoken');
  const BaseController = require('@fsiaonma/elpis').Controller.Base(app);
  return class AuthController extends BaseController {
    async login(ctx) {
      const { username, password } = ctx.request.body;

      const { user: userService } = app.service;
      const userItem = await userService.getByUsernameAndPassword({ username, password });

      if (!userItem) {
        return this.fail(ctx, '账号或密码错误', 50000);
      }

      // 利用 jwt 生成一个 token
      const payload = { userId: userItem.user_id };
      const { jwtSecreKey } = app.config;
      const token = jwt.sign(payload, jwtSecreKey, {
        expiresIn: 60 * 60 * 24 // 一天有效
      });

      // 挂载到 cookie 上
      const expires = new Date();
      expires.setTime(expires.getTime() + 1000 * 60 * 60 * 24); // 一天有效
      ctx.cookies.set('token', token, {
        expires,
        httpOnly: true
      });

      this.success(ctx, {
        nickname: userItem.nickname
      });
    }

    async logout(ctx) {
      // 清空 cookie
      ctx.cookies.set('token', '', {
        expires: new Date(0) // 设置过期时间，让 cookie 失效
      });
      // 重定向到登录页
      ctx.status = 302;
      ctx.redirect('/view/auth/login');
    }
  }
}