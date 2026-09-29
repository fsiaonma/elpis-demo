module.exports = (app) => {
	const sleep = async (time) => {
		return new Promise(resolve => {
			setTimeout(() => {
				resolve();
			}, time);
		});
	}

	const baseController = require('@fsiaonma/elpis').Controller.Base(app);
	return class BusinessController extends baseController {
		async create(ctx) {
			const {
				product_name: productName,
				price,
				inventory
			} = ctx.request.body;
			await sleep(500);
			this.success(ctx, {
				product_id: Date.now(),
				product_name: productName,
				price,
				inventory
			});
		}

		async update(ctx) {
			const {
				product_id: productId,
				product_name: productName,
				price,
				inventory
			} = ctx.request.body;
			await sleep(500);
			this.success(ctx, {
				product_id: productId,
				product_name: productName,
				price,
				inventory
			});
		} 

		async remove(ctx) {
			const { product_id: productId } = ctx.request.body;
			await sleep(500);
			this.success(ctx, {
				projKey: ctx.projKey,
				product_id: productId
			});
		}

		async get(ctx) {
			const { product_id: productId } = ctx.request.query;

			await sleep(500);
			const productList = this.getProductList(ctx);
			const productItem = productList.find(item => item.product_id === productId);

			this.success(ctx, productItem);
		}

		async getList(ctx) {
			const { product_name: productName, page, size } = ctx.request.query;
			await sleep(500);
			let productList = this.getProductList(ctx);

			if (productName && productName !== 'all') {
				productList = productList.filter(item => item.product_name === productName);
			}

			this.success(ctx, productList, {
				total: 3,
				page,
				size
			})
		}

		getProductEnumList(ctx) {
			this.success(ctx, [{
				label: '全部',
				value: 'all'
			}, {
				label: `${ctx.projKey} -《大前端面试宝典》`,
				value: `${ctx.projKey} -《大前端面试宝典》`
			}, {
				label: `${ctx.projKey} -《前端求职之道》`,
				value: `${ctx.projKey} -《前端求职之道》`
			}, {
				label: `${ctx.projKey} -《大前端全栈实践》`,
				value: `${ctx.projKey} -《大前端全栈实践》`
			}]);
		}

		getProductList(ctx) {
			return [{
				product_id: '1',
				product_name: `${ctx.projKey} -《大前端面试宝典》`,
				price: 39.9,
				inventory: 99999,
				create_time: '2023-07-03 20:23:22'
			}, {
				product_id: '2',
				product_name: `${ctx.projKey} -《前端求职之道》`,
				price: 199,
				inventory: 1000000,
				create_time: '2023-02-14 22:12:44'
			}, {
				product_id: '3',
				product_name: `${ctx.projKey} -《大前端全栈实践》`,
				price: 899,
				inventory: 18888,
				create_time: '2024-11-17 11:02:01'
			}]
		}
	}
}