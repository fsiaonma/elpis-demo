module.exports = {
  '/api/auth/login': {
    post: {
      body: {
        type: 'object',
        properties: {
          username: {
            type: 'string'
          },
          password: {
            type: 'string'
          }
        },
        required: [ 'username', 'password' ]
      }
    }
  },
  '/api/auth/logout': {
    get: {
      query: {}
    }
  }
}