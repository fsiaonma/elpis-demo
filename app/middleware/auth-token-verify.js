const jwt = require('jsonwebtoken');
module.exports = (app) => {
  const whiteList = [
    '/view/auth/login',
    '/api/auth/login',
    '/api/auth/logout'
  ];

  return async (ctx, next) => {
    if (whiteList.includes(ctx.path)) {
      await next();
      return;
    }

    let isLogin = true;

    ctx.token = ctx.cookies.get('token');
    if (!ctx.token) { // 是否有 token
      isLogin = false
    } else { // token 是否有效
      try {
        const { jwtSecreKey } = app.config;
        const decoded = jwt.verify(ctx.token, jwtSecreKey);
        ctx.userId = decoded.userId;
      } catch (e) {
        isLogin = false;
      }
    }

    if (!isLogin) {
      ctx.cookies.set('token', '', {
        expires: new Date(0)
      });

      if (ctx.url.indexOf('api') > -1) {
        ctx.body = {
          success: false,
          code: 50000,
          message: '请重新登录'
        };
      } else {
        ctx.status = 302;
        ctx.redirect(`/view/auth/login?callback=${ctx.url}`);
      }

      return;
    }

    await next();
  }
}