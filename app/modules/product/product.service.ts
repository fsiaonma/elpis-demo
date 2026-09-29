import { Injectable } from '@nestjs/common';

@Injectable()
export class ProductService {
  private async sleep(time: number) {
    return new Promise<void>((resolve) => {
      setTimeout(() => resolve(), time);
    });
  }

  getProductList(projKey: string) {
    return [
      {
        product_id: '1',
        product_name: `${projKey} -《大前端面试宝典》`,
        price: 39.9,
        inventory: 99999,
        create_time: '2023-07-03 20:23:22',
      },
      {
        product_id: '2',
        product_name: `${projKey} -《前端求职之道》`,
        price: 199,
        inventory: 1000000,
        create_time: '2023-02-14 22:12:44',
      },
      {
        product_id: '3',
        product_name: `${projKey} -《大前端全栈实践》`,
        price: 899,
        inventory: 18888,
        create_time: '2024-11-17 11:02:01',
      },
    ];
  }

  async create({
    product_name: productName,
    price,
    inventory,
  }: {
    product_name: string;
    price?: number;
    inventory?: number;
  }) {
    await this.sleep(500);
    return {
      product_id: Date.now(),
      product_name: productName,
      price,
      inventory,
    };
  }

  async update(
    {
      product_id: productId,
      product_name: productName,
      price,
      inventory,
    }: {
      product_id: string;
      product_name: string;
      price?: number;
      inventory?: number;
    },
  ) {
    await this.sleep(500);
    return {
      product_id: productId,
      product_name: productName,
      price,
      inventory,
    };
  }

  async remove(projKey: string, productId: string) {
    await this.sleep(500);
    return {
      projKey,
      product_id: productId,
    };
  }

  async get(projKey: string, productId: string) {
    await this.sleep(500);
    const productList = this.getProductList(projKey);
    return productList.find((item) => item.product_id === productId);
  }

  async getList(
    projKey: string,
    {
      product_name: productName,
      page,
      size,
    }: {
      product_name?: string;
      page: string;
      size: string;
    },
  ) {
    await this.sleep(500);
    let productList = this.getProductList(projKey);

    if (productName && productName !== 'all') {
      productList = productList.filter(
        (item) => item.product_name === productName,
      );
    }

    return {
      list: productList,
      total: 3,
      page,
      size,
    };
  }

  getProductEnumList(projKey: string) {
    return [
      {
        label: '全部',
        value: 'all',
      },
      {
        label: `${projKey} -《大前端面试宝典》`,
        value: `${projKey} -《大前端面试宝典》`,
      },
      {
        label: `${projKey} -《前端求职之道》`,
        value: `${projKey} -《前端求职之道》`,
      },
      {
        label: `${projKey} -《大前端全栈实践》`,
        value: `${projKey} -《大前端全栈实践》`,
      },
    ];
  }
}
