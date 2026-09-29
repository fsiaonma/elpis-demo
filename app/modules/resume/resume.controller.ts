import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BaseController } from '@fsiaonma/elpis/nest';
import { ResumeService, UploadedResumeFile } from './resume.service';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('api/resume')
export class ResumeAnalyzeController extends BaseController {
  constructor(private readonly resumeService: ResumeService) {
    super();
  }

  @Get('list')
  async getList(
    @Query('fileName') fileName?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('size') size = '50',
  ) {
    try {
      const result = await this.resumeService.getResumeList({
        fileName,
        status,
        page: Number(page),
        size: Number(size),
      });
      return this.success(result.list, {
        total: result.total,
        page: result.page,
        size: result.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取列表失败';
      return this.fail(message, 50000);
    }
  }

  @Post(':id/analyze')
  async startAnalyze(@Param('id') id: string) {
    try {
      const data = await this.resumeService.startAnalyze(id);
      return this.success(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : '启动分析失败';
      return this.fail(message, 400);
    }
  }

  @Get(':id/analyze')
  async getAnalyzeStatus(@Param('id') id: string) {
    try {
      const data = await this.resumeService.getAnalyzeStatus(id);
      return this.success(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : '查询分析状态失败';
      return this.fail(message, 400);
    }
  }

  @Post(':id/match/recompute')
  async recomputeMatch(
    @Param('id') id: string,
    @Body() body: { weights?: Record<string, unknown> },
  ) {
    try {
      const data = await this.resumeService.recomputeMatch(id, body?.weights);
      return this.success(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : '重算失败';
      return this.fail(message, 400);
    }
  }

  @Get()
  async get(@Query('id') id?: string) {
    if (!id) {
      return this.fail('缺少 id', 400);
    }
    try {
      const record = await this.resumeService.getResume(id);
      return this.success(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取失败';
      return this.fail(message, 404);
    }
  }
}

@Controller('api/proj/resume')
export class ProjResumeController extends BaseController {
  constructor(private readonly resumeService: ResumeService) {
    super();
  }

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(@UploadedFile() file?: UploadedResumeFile) {
    try {
      const record = await this.resumeService.upload(file);
      return this.success(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败';
      return this.fail(message, 400);
    }
  }

  @Get('list')
  async getList(
    @Query('fileName') fileName?: string,
    @Query('status') status?: string,
    @Query('page') page = '1',
    @Query('size') size = '50',
  ) {
    try {
      const result = await this.resumeService.getList({
        fileName,
        status,
        page: Number(page),
        size: Number(size),
      });
      return this.success(result.list, { total: result.total });
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取列表失败';
      return this.fail(message, 50000);
    }
  }

  @Get()
  async get(@Query('id') id?: string) {
    if (!id) {
      return this.fail('缺少 id', 400);
    }
    try {
      const record = await this.resumeService.get(id);
      return this.success(record);
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取失败';
      return this.fail(message, 404);
    }
  }

  @Delete()
  async remove(@Body() body: { id?: string }) {
    if (!body?.id) {
      return this.fail('缺少简历 id', 400);
    }
    try {
      const data = await this.resumeService.remove(body.id);
      return this.success(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : '删除失败';
      return this.fail(message, 400);
    }
  }
}

@Controller('api/proj/job')
export class JobController extends BaseController {
  constructor(private readonly resumeService: ResumeService) {
    super();
  }

  @Get('list')
  async getList(
    @Query('title') title?: string,
    @Query('company') company?: string,
    @Query('city') city?: string,
    @Query('level') level?: string,
    @Query('page') page = '1',
    @Query('size') size = '50',
  ) {
    try {
      const result = await this.resumeService.getJobList({
        title,
        company,
        city,
        level,
        page: Number(page),
        size: Number(size),
      });
      return this.success(result.list, {
        total: result.total,
        page: result.page,
        size: result.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : '读取岗位列表失败';
      return this.fail(message, 50000);
    }
  }
}
