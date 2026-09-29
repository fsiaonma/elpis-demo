module.exports = (app) => {
  const moment = require('moment');
  const { v4: uuidv4 } = require('uuid');
  const generator = require('generate-password');
  const BaseService = require('@fsiaonma/elpis').Service.Base(app);
  return class UserService extends BaseService {
    async create({
      username,
      nickname,
      desc,
      sex,
    }) {
      const userId = uuidv4().replace(/-/g, '');
      const password = generator.generate({
        length: 8,
        numbers: true
      });

      await app.database('t_user').insert({
        user_id: userId,
        username,
        password,
        nickname,
        desc,
        sex,
        status: app.status.NORMAL,
        create_time: moment().format('YYYY-MM-DD HH:mm:ss')
      });

      return userId;
    } 

    async update(userId, {
      nickname,
      desc,
      sex,
    }) {
      const updateObj = {};
      if (nickname) { updateObj.nickname = nickname; }
      if (desc) { updateObj.desc = desc; }
      if (sex) { updateObj.sex = sex; }

      await app.database('t_user').update({
        ...updateObj,
        update_time: moment().format('YYYY-MM-DD HH:mm:ss')
      }).where({
        user_id: userId
      });

      return userId;
    }

    async delete(userId) {
      await app.database('t_user').update({
        status: app.status.DELETE,
        update_time: moment().format('YYYY-MM-DD HH:mm:ss')
      }).where({
        user_id: userId
      });

      return userId;
    }

    async get(userId) {
      const result = await app.database('t_user').select('*').where({
        user_id: userId,
        status: app.status.NORMAL
      });
      return result[0] ?? {};
    }

    async getList({
      username,
      nickname,
      sex,
      createTimeStart,
      createTimeEnd,
      page,
      size
    }) {
      const queryObj = { status: app.status.NORMAL };
      if (username) { queryObj.username = username; }
      if (nickname) { queryObj.nickname = nickname; }
      if (sex && sex !== -999) { queryObj.sex = sex; }

      let sql = app.database('t_user').select('*').where(queryObj);

      if (createTimeStart) { sql = sql.andWhere('create_time', '>=', createTimeStart); }
      if (createTimeEnd) { sql = sql.andWhere('create_time', '<', createTimeEnd); }

      const offset = (page - 1) * size;
      sql = sql.limit(size).offset(offset);

      return await sql;
    }

    async getListTotal({
      username,
      nickname,
      sex,
      createTimeStart,
      createTimeEnd
    }) {
      const queryObj = { status: app.status.NORMAL };
      if (username) { queryObj.username = username; }
      if (nickname) { queryObj.nickname = nickname; }
      if (sex && sex !== -999) { queryObj.sex = sex; }

      let sql = app.database('t_user').countDistinct('user_id as user_amount').where(queryObj);

      if (createTimeStart) { sql = sql.andWhere('create_time', '>=', createTimeStart); }
      if (createTimeEnd) { sql = sql.andWhere('create_time', '<', createTimeEnd); }

      const res = await sql;

      return res[0].user_amount;
    }

    async getByUsernameAndPassword({ username, password }) {
      const { database } = app;
      
      const res = await database('t_user').select('*').where({
        username,
        password,
        status: app.status.NORMAL
      }).limit(1);

      return res[0];
    }
  }
}