module.exports = (app) => {
  const moment = require('moment');
  const BaseController = require('@fsiaonma/elpis').Controller.Base(app);
  return class UserController extends BaseController {
    async create(ctx) {
      const {
        username,
        nickname,
        desc,
        sex,
      } = ctx.request.body;

      const { user: userService } = app.service;
      const userId = await userService.create({
        username,
        nickname,
        desc,
        sex,
      });

      this.success(ctx, { user_id: userId });
    }

    async update(ctx) {
      const {
        user_id: userId,
        nickname,
        desc,
        sex,
      } = ctx.request.body;

      const { user: userService } = app.service;
      await userService.update(userId, {
        nickname,
        desc,
        sex,
      });

      this.success(ctx, { user_id: userId });
    }

    async delete(ctx) {
      const {
        user_id: userId,
      } = ctx.request.body;

      const { user: userService } = app.service;
      await userService.delete(userId);

      this.success(ctx, { user_id: userId });
    }

    async get(ctx) {
      const { user_id: userId } = ctx.request.query;

      const { user: userService } = app.service;
      const userItem = await userService.get(userId);

      userItem.create_time = moment(userItem.create_time).format('YYYY-MM-DD HH:mm:ss');

      this.success(ctx, userItem);
    }

    async getList(ctx) {
      const {
        username,
        nickname,
        sex,
        create_time_start: createTimeStart,
        create_time_end: createTimeEnd,
        page,
        size
      } = ctx.request.query;

      const { user: userService } = app.service;

      const jobs = [];

      // 获取数据列表 
      jobs.push(userService.getList({
        username,
        nickname,
        sex: Number(sex),
        createTimeStart,
        createTimeEnd,
        page: Number(page),
        size: Number(size)
      }));
      
      // 获取总数
      jobs.push(userService.getListTotal({
        username,
        nickname,
        sex: Number(sex),
        createTimeStart,
        createTimeEnd,
      }));
      
      const res = await Promise.all(jobs);

      if (!res[0] || res.length <= 0) {
        return this.success(ctx, [], { total: 0 });
      }

      // 展示数据处理
      const resList = res[0];
      resList.forEach(item => {
        item.sex = item.sex === 1 ? '男' : '女';
        item.create_time = moment(item.create_time).format('YYYY-MM-DD HH:mm:ss');
      });
      const total = res[1];

      this.success(ctx, resList, { total });
    }
  }
}