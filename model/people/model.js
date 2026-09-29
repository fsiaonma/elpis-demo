module.exports = {
  model: 'people',
  name: '人员管理系统',
  menu: [{
    key: 'user',
    name: '人员管理',
    menuType: 'module',
    moduleType: 'schema',
    schemaConfig: {
      api: '/api/proj/user',
      schema: {
        type: 'object',
        properties: {
          user_id: {
            type: 'string',
            label: '用户ID',
            tableOption: {
              width: 350,
              'show-overflow-tooltip': true
            },
            detailPanelOption: {}
          },
          username: {
            type: 'string',
            label: '账号',
            tableOption: {
              width: 200
            },
            searchOption: {
              comType: 'input'
            },
            createFormOption: {
              comType: 'input'
            },
            detailPanelOption: {}
          },
          password: {
            type: 'string',
            label: '密码',
            detailPanelOption: {}
          },
          nickname: {
            type: 'string',
            label: '昵称',
            tableOption: {
              width: 200
            },
            searchOption: {
              comType: 'input'
            },
            createFormOption: {
              comType: 'input'
            },
            editFormOption: {
              comType: 'input'
            }
          },
          desc: {
            type: 'string',
            label: '描述',
            createFormOption: {
              comType: 'textarea'
            },
            editFormOption: {
              comType: 'textarea'
            },
            detailPanelOption: {}
          },
          sex: {
            type: 'number',
            label: '性别',
            tableOption: {
              width: 150
            },
            searchOption: {
              comType: 'select',
              enumList: [{
                label: '全部',
                value: -999
              }, {
                label: '男',
                value: 1
              }, {
                label: '女',
                value: 2
              }]
            },
            createFormOption: {
              comType: 'select',
              enumList: [{
                label: '男',
                value: 1
              }, {
                label: '女',
                value: 2
              }]
            },
            editFormOption: {
              comType: 'select',
              enumList: [{
                label: '男',
                value: 1
              }, {
                label: '女',
                value: 2
              }]
            }
          },
          create_time: {
            type: 'string',
            label: '创建时间',
            tableOption: {},
            searchOption: {
              comType: 'dateRange'
            }
          }
        },
        required: [ 'username', 'nickname', 'sex' ]
      },
      tableConfig: {
        headerButtons: [{
          label: '新增用户',
          eventKey: 'showComponent',
          eventOption: {
            comName: 'createForm'
          },
          type: 'primary',
          plain: true
        }],
        rowButtons: [{
          label: '查看详情',
          eventKey: 'showComponent',
          eventOption: {
            comName: 'detailPanel'
          },
          type: 'primary'
        }, {
          label: '修改',
          eventKey: 'showComponent',
          eventOption: {
            comName: 'editForm'
          },
          type: 'warning'
        }, {
          label: '删除',
          eventKey: 'remove',
          eventOption: {
            params: {
              user_id: 'schema::user_id'
            }
          },
          type: 'danger'
        }]
      },
      componentConfig: {
        createForm: {
          title: '新增用户',
          saveBtnText: '保存'
        },
        editForm: {
          mainKey: 'user_id',
          title: '修改用户',
          saveBtnText: '保存'
        },
        detailPanel: {
          mainKey: 'user_id',
          title: '用户详情'
        }
      } 
    }
  }]
}