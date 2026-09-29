export default ({ routes, siderRoutes }) => {
	// 头部路由
	routes.push({
		path: '/view/dashboard/todo',
		component: () => import('./todo/todo.vue')
	});

	routes.push({
		path: '/view/dashboard/agent',
		component: () => import('./agent/agent.vue')
	});

	routes.push({
		path: '/view/dashboard/trace',
		component: () => import('./trace/trace.vue')
	});

	routes.push({
		path: '/view/dashboard/eval',
		component: () => import('./eval/eval.vue')
	});

	// 侧边路由
	siderRoutes.push({
		path: 'todo',
		component: () => import('./todo/todo.vue')
	});
}

