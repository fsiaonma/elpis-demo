module.exports = (app, router) => {
  const { user: userController } = app.controller;
  router.post('/api/proj/user', userController.create.bind(userController));
  router.put('/api/proj/user', userController.update.bind(userController));
  router.delete('/api/proj/user', userController.delete.bind(userController));
  router.get('/api/proj/user', userController.get.bind(userController));
  router.get('/api/proj/user/list', userController.getList.bind(userController));
}