module.exports = {
	name: 'Agent 实验室',
	desc: 'Part3 Agent Runtime 演示项目',
	homePage: '/agent?proj_key=lab&key=project-assistant-chat',
	menu: [{
		key: 'agent-eval',
		name: 'Agent 回归',
		menuType: 'module',
		moduleType: 'custom',
		customConfig: {
			path: '/eval',
		},
		homePage: '/eval?proj_key=lab&key=agent-eval',
	}],
};
