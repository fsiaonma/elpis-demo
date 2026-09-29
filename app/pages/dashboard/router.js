module.exports = ({ routes, siderRoutes }) => {
	// 头部路由
	routes.push({
		path: '/view/dashboard/todo',
		component: () => import('./todo/todo.vue')
	});

	// 侧边路由
	siderRoutes.push({
		path: 'todo',
		component: () => import('./todo/todo.vue')
	});
}

