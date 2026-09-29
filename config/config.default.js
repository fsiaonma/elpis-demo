module.exports = {
	name: 'elpis-demo',
  jwtSecreKey: 'b87e4ac8215ca7283f5f8a82452d7e6a',
  // 数据库配置
  db: {
    client: 'mysql2',
    connection: {
      host: 'localhost',
      port: '3306',
      database: 'zteam',
      user: 'root',
      password: 'Sam@123456'
    },
    pool: {
      min: 5,
      max: 20
    }
  },
  apiSignVerify: {
    whiteList: [
      '/api/auth/logout'
    ]
  }
}