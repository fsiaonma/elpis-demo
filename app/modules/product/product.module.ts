import { Module } from '@nestjs/common';
import { ProductController, ProductEnumController } from './product.controller';
import { ProductService } from './product.service';

@Module({
  controllers: [ProductController, ProductEnumController],
  providers: [ProductService],
})
export class ProductModule {}
