module.exports = {
	name: 'elpis-demo-beta',
  // 数据库配置
  db: {
    client: 'mysql2',
    connection: {
      host: 'gz-cdb-6rlwuan7.sql.tencentcdb.com',
      port: '27250',
      database: 'elpis_beta',
      user: 'root',
      password: 'Sam@135246'
    },
    pool: {
      min: 5,
      max: 20
    }
  }
}