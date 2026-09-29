import { Injectable } from '@nestjs/common';
import { DatabaseProvider } from '@fsiaonma/elpis/nest';
import generator from 'generate-password';
import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { StatusProvider } from './status.provider';

@Injectable()
export class UserService {
  constructor(
    private readonly databaseProvider: DatabaseProvider,
    private readonly statusProvider: StatusProvider,
  ) {}

  private get db() {
    return this.databaseProvider.db;
  }

  async create({
    username,
    nickname,
    desc,
    sex,
  }: {
    username?: string;
    nickname?: string;
    desc?: string;
    sex?: number;
  }) {
    const userId = uuidv4().replace(/-/g, '');
    const password = generator.generate({
      length: 8,
      numbers: true,
    });

    await this.db!('t_user').insert({
      user_id: userId,
      username,
      password,
      nickname,
      desc,
      sex,
      status: this.statusProvider.NORMAL,
      create_time: moment().format('YYYY-MM-DD HH:mm:ss'),
    });

    return userId;
  }

  async update(
    userId: string,
    {
      nickname,
      desc,
      sex,
    }: {
      nickname?: string;
      desc?: string;
      sex?: number;
    },
  ) {
    const updateObj: Record<string, unknown> = {};
    if (nickname) {
      updateObj.nickname = nickname;
    }
    if (desc) {
      updateObj.desc = desc;
    }
    if (sex) {
      updateObj.sex = sex;
    }

    await this.db!('t_user')
      .update({
        ...updateObj,
        update_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      })
      .where({
        user_id: userId,
      });

    return userId;
  }

  async delete(userId: string) {
    await this.db!('t_user')
      .update({
        status: this.statusProvider.DELETE,
        update_time: moment().format('YYYY-MM-DD HH:mm:ss'),
      })
      .where({
        user_id: userId,
      });

    return userId;
  }

  async get(userId: string) {
    const result = await this.db!('t_user')
      .select('*')
      .where({
        user_id: userId,
        status: this.statusProvider.NORMAL,
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
    size,
  }: {
    username?: string;
    nickname?: string;
    sex?: number;
    createTimeStart?: string;
    createTimeEnd?: string;
    page: number;
    size: number;
  }) {
    const queryObj: Record<string, unknown> = {
      status: this.statusProvider.NORMAL,
    };
    if (username) {
      queryObj.username = username;
    }
    if (nickname) {
      queryObj.nickname = nickname;
    }
    if (sex && sex !== -999) {
      queryObj.sex = sex;
    }

    let sql = this.db!('t_user').select('*').where(queryObj);

    if (createTimeStart) {
      sql = sql.andWhere('create_time', '>=', createTimeStart);
    }
    if (createTimeEnd) {
      sql = sql.andWhere('create_time', '<', createTimeEnd);
    }

    const offset = (page - 1) * size;
    sql = sql.limit(size).offset(offset);

    return await sql;
  }

  async getListTotal({
    username,
    nickname,
    sex,
    createTimeStart,
    createTimeEnd,
  }: {
    username?: string;
    nickname?: string;
    sex?: number;
    createTimeStart?: string;
    createTimeEnd?: string;
  }) {
    const queryObj: Record<string, unknown> = {
      status: this.statusProvider.NORMAL,
    };
    if (username) {
      queryObj.username = username;
    }
    if (nickname) {
      queryObj.nickname = nickname;
    }
    if (sex && sex !== -999) {
      queryObj.sex = sex;
    }

    let sql = this.db!('t_user')
      .countDistinct('user_id as user_amount')
      .where(queryObj);

    if (createTimeStart) {
      sql = sql.andWhere('create_time', '>=', createTimeStart);
    }
    if (createTimeEnd) {
      sql = sql.andWhere('create_time', '<', createTimeEnd);
    }

    const res = await sql;
    const row = res[0] as unknown as { user_amount: string | number };
    return row.user_amount;
  }

  async getByUsernameAndPassword({
    username,
    password,
  }: {
    username: string;
    password: string;
  }) {
    const db = this.db;
    if (!db) {
      return undefined;
    }

    const res = await db('t_user')
      .select('*')
      .where({
        username,
        password,
        status: this.statusProvider.NORMAL,
      })
      .limit(1);

    return res[0];
  }
}
