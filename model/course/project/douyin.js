module.exports = {
	name: '抖音课堂',
	desc: '抖音课程管理系统',
	homePage: '/todo?proj_key=douyin&key=video',
	menu: [{
		key: 'traffic',
		name: '流量管理',
		menuType: 'module',
		moduleType: 'sider',
		siderConfig: {
			menu: [{
				key: 'user-traffic',
				name: '学员流量',
				menuType: 'module',
				moduleType: 'custom',
				customConfig: {
					path: '/todo'
				}
			}]
		}
	}]
}