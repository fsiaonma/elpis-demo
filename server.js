const {
	serverStart
} = require('@fsiaonma/elpis');  

// 启动 elpis 服务
const app = serverStart({
	name: 'ElpisDemo',
  icon: '/static/logo.png',
	homePage: '/view/project-list'
});
