import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { BaseController } from '@fsiaonma/elpis/nest';
import moment from 'moment';
import { CreateUserDto } from './dto/create-user.dto';
import { DeleteUserDto } from './dto/delete-user.dto';
import { GetUserDto } from './dto/get-user.dto';
import { GetUserListDto } from './dto/get-user-list.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserService } from './user.service';

@Controller('api/proj/user')
export class UserController extends BaseController {
  constructor(private readonly userService: UserService) {
    super();
  }

  @Post()
  async create(@Body() dto: CreateUserDto) {
    const userId = await this.userService.create(dto);
    return this.success({ user_id: userId });
  }

  @Put()
  async update(@Body() dto: UpdateUserDto) {
    const { user_id: userId, ...updateData } = dto;
    await this.userService.update(userId, updateData);
    return this.success({ user_id: userId });
  }

  @Delete()
  async delete(@Body() dto: DeleteUserDto) {
    await this.userService.delete(dto.user_id);
    return this.success({ user_id: dto.user_id });
  }

  @Get()
  async get(@Query() dto: GetUserDto) {
    const userItem = await this.userService.get(dto.user_id);
    if (userItem.create_time) {
      userItem.create_time = moment(userItem.create_time).format(
        'YYYY-MM-DD HH:mm:ss',
      );
    }
    return this.success(userItem);
  }

  @Get('list')
  async getList(@Query() dto: GetUserListDto) {
    const {
      username,
      nickname,
      sex,
      create_time_start: createTimeStart,
      create_time_end: createTimeEnd,
      page,
      size,
    } = dto;

    const [list, total] = await Promise.all([
      this.userService.getList({
        username,
        nickname,
        sex: Number(sex),
        createTimeStart,
        createTimeEnd,
        page: Number(page),
        size: Number(size),
      }),
      this.userService.getListTotal({
        username,
        nickname,
        sex: Number(sex),
        createTimeStart,
        createTimeEnd,
      }),
    ]);

    if (!list || list.length <= 0) {
      return this.success([], { total: 0 });
    }

    list.forEach((item: Record<string, unknown>) => {
      item.sex = item.sex === 1 ? '男' : '女';
      item.create_time = moment(item.create_time as string).format(
        'YYYY-MM-DD HH:mm:ss',
      );
    });

    return this.success(list, { total });
  }
}
