import {
  Body,
  Controller,
  Delete,
  Get,
  Post,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { BaseController } from '@fsiaonma/elpis/nest';
import { Request } from 'express';
import { CreateProductDto } from './dto/create-product.dto';
import { GetProductDto } from './dto/get-product.dto';
import { GetProductListDto } from './dto/get-product-list.dto';
import { RemoveProductDto } from './dto/remove-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductService } from './product.service';

type ProjRequest = Request & { projKey: string };

@Controller('api/proj/product')
export class ProductController extends BaseController {
  constructor(private readonly productService: ProductService) {
    super();
  }

  @Post()
  async create(@Body() dto: CreateProductDto, @Req() req: ProjRequest) {
    const data = await this.productService.create(dto);
    return this.success(data);
  }

  @Put()
  async update(@Body() dto: UpdateProductDto) {
    const data = await this.productService.update(dto);
    return this.success(data);
  }

  @Delete()
  async remove(@Body() dto: RemoveProductDto, @Req() req: ProjRequest) {
    const data = await this.productService.remove(req.projKey, dto.product_id);
    return this.success(data);
  }

  @Get()
  async get(@Query() dto: GetProductDto, @Req() req: ProjRequest) {
    const data = await this.productService.get(req.projKey, dto.product_id);
    return this.success(data);
  }

  @Get('list')
  async getList(@Query() dto: GetProductListDto, @Req() req: ProjRequest) {
    const { list, total, page, size } = await this.productService.getList(
      req.projKey,
      dto,
    );
    return this.success(list, { total, page, size });
  }
}

@Controller('api/proj/product_enum')
export class ProductEnumController extends BaseController {
  constructor(private readonly productService: ProductService) {
    super();
  }

  @Get('list')
  getProductEnumList(@Req() req: ProjRequest) {
    return this.success(this.productService.getProductEnumList(req.projKey));
  }
}
