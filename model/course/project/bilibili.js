module.exports = {
	name: 'B站课堂',
	desc: 'B站课程管理系统',
	homePage: '/todo?proj_key=bilibili&key=video',
	menu: [{
		key: 'video',
		name: '视频管理(B站)'
	}, {
		key: 'user',
		name: '用户管理(B站)'
	}, {
		key: 'resource',
		name: '课程资料',
		menuType: 'module',
		moduleType: 'sider',
		siderConfig: {
			menu: [{
				key: 'pdf',
				name: 'PDF',
				menuType: 'module',
				moduleType: 'custom',
				customConfig: {
					path: '/todo'
				}
			}, {
				key: 'excel',
				name: 'Excel',
				menuType: 'module',
				moduleType: 'custom',
				customConfig: {
					path: '/todo'
				}
			}, {
				key: 'ppt',
				name: 'PPT',
				menuType: 'module',
				moduleType: 'custom',
				customConfig: {
					path: '/todo'
				}
			}]
		}
	}]
}