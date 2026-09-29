module.exports = {
	model: 'dashboard',
	name: 'Agent 实验室',
	menu: [{
		key: 'project-assistant-chat',
		name: '项目助手',
		menuType: 'module',
		moduleType: 'custom',
		customConfig: {
			path: '/agent',
		},
		agentConfig: {
			agentName: 'project-assistant',
			apiBase: '/api/ai',
		},
	}, {
		key: 'agent-trace',
		name: 'Agent Trace',
		menuType: 'module',
		moduleType: 'custom',
		customConfig: {
			path: '/trace',
		},
	}],
};
