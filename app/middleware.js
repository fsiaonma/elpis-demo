module.exports = (app) => {
  // 登录态校验
  app.use(app.middlewares.authTokenVerify);
}