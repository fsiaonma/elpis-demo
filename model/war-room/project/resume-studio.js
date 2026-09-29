module.exports = {
  name: '简历作战室',
  desc: '简历库与岗位库 · 上传简历 · 匹配分析',
  homePage: '/schema?proj_key=resume-studio&key=resume-list',
  menu: [{
    key: 'resume-list',
    name: '简历库',
    menuType: 'module',
    moduleType: 'schema',
    schemaConfig: {
      api: '/api/proj/resume',
      schema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            label: 'ID',
            tableOption: {
              visible: false,
            },
          },
          fileName: {
            type: 'string',
            label: '文件名',
            tableOption: {
              minWidth: 220,
              'show-overflow-tooltip': true,
            },
            searchOption: {
              comType: 'input',
            },
          },
          uploadedAt: {
            type: 'string',
            label: '上传时间',
            tableOption: {
              width: 180,
            },
          },
          cand_name: {
            type: 'string',
            label: '姓名',
            tableOption: {
              width: 100,
            },
          },
          top_degree: {
            type: 'string',
            label: '最高学历',
            tableOption: {
              width: 100,
            },
          },
          last_company: {
            type: 'string',
            label: '最近公司',
            tableOption: {
              minWidth: 140,
              'show-overflow-tooltip': true,
            },
          },
          skill_count: {
            type: 'number',
            label: '技能数',
            tableOption: {
              width: 90,
            },
          },
          status: {
            type: 'string',
            label: '状态',
            tableOption: {
              width: 120,
            },
            searchOption: {
              comType: 'select',
              enumList: [{
                label: '全部',
                value: '',
              }, {
                label: '已上传',
                value: 'uploaded',
              }, {
                label: '分析中',
                value: 'parsing',
              }, {
                label: '已解析',
                value: 'parsed',
              }, {
                label: '失败',
                value: 'failed',
              }],
            },
          },
        },
      },
      tableConfig: {
        headerButtons: [{
          label: '上传简历',
          eventKey: 'showComponent',
          eventOption: {
            comName: 'uploadForm',
          },
          type: 'primary',
          plain: true,
        }],
        rowButtons: [{
          label: '分析',
          eventKey: 'showComponent',
          eventOption: {
            comName: 'analyzeRedirect',
          },
          type: 'primary',
        }, {
          label: '删除',
          eventKey: 'remove',
          eventOption: {
            params: {
              id: 'schema::id',
            },
          },
          type: 'danger',
        }],
      },
      componentConfig: {
        uploadForm: {
          title: '上传简历',
          saveBtnText: '上传',
        },
        analyzeRedirect: {},
      },
    },
  }, {
    key: 'job-list',
    name: '岗位库',
    menuType: 'module',
    moduleType: 'schema',
    schemaConfig: {
      api: '/api/proj/job',
      schema: {
        type: 'object',
        properties: {
          id: {
            type: 'string',
            label: 'ID',
            tableOption: {
              visible: false,
            },
          },
          title: {
            type: 'string',
            label: '标题',
            tableOption: {
              minWidth: 200,
              'show-overflow-tooltip': true,
            },
            searchOption: {
              comType: 'input',
            },
          },
          company: {
            type: 'string',
            label: '公司',
            tableOption: {
              width: 160,
            },
            searchOption: {
              comType: 'input',
            },
          },
          city: {
            type: 'string',
            label: '城市',
            tableOption: {
              width: 120,
            },
            searchOption: {
              comType: 'input',
            },
          },
          level: {
            type: 'string',
            label: '级别',
            tableOption: {
              width: 100,
            },
            searchOption: {
              comType: 'input',
            },
          },
          salary_range: {
            type: 'string',
            label: '薪资',
            tableOption: {
              width: 140,
            },
          },
        },
      },
      tableConfig: {
        headerButtons: [],
        rowButtons: [],
      },
    },
  }],
};
