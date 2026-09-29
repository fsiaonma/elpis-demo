<template>
  <div class="json-schema-demo">
    <div class="demo-header">
      <h2>动态组件生成器</h2>
    </div>
    <div class="demo-content">
        <div class="left-panel">
          <div class="panel-header">
            <h3>SCHEMA 输入</h3>
            <el-select
              v-model="currentDemo"
              placeholder="选择示例"
              size="small"
              @change="switchDemo"
              class="demo-selector"
            >
              <el-option
                v-for="demo in demoList"
                :key="demo.value"
                :label="demo.label"
                :value="demo.value"
              />
            </el-select>
          </div>
        <div class="json-editor">
          <MonacoEditor
            v-model:value="jsonSchemaText"
            language="json"
            :theme="editorTheme"
            @change="parseSchema"
          />
        </div>
        <div v-if="parseError" class="error-message">
          <el-alert type="error" :closable="false">
            {{ parseError }}
          </el-alert>
        </div>
      </div>

      <!-- 右侧：动态组件展示区 -->
      <div class="right-panel">
        <div class="panel-header">
          <h3>DEMO 展示区</h3>
          <span class="panel-tips">根据 DSL 自动生成组件</span>
        </div>
        
        <!-- 搜索栏区域 -->
        <div class="component-section">
          <div class="section-header">
            <h3>搜索栏</h3>
          </div>
          <div class="section-content">
            <schema-search-bar
              v-if="searchSchema"
              ref="searchBarRef"
              :schema="searchSchema"
              @search="handleSearch"
            />
            <div v-else class="empty-state-mini">
              <span>等待 Schema 加载...</span>
            </div>
          </div>
          <!-- 搜索结果 -->
          <div v-if="searchValues" class="section-output">
            <strong>搜索条件：</strong>
            <pre>{{ JSON.stringify(searchValues, null, 2) }}</pre>
          </div>
        </div>

        <!-- 表格区域 -->
        <div class="component-section">
          <div class="section-header">
            <h3>数据表格</h3>
          </div>
          <div class="section-content table-wrapper">
            <schema-table
              v-if="tableSchema"
              ref="tableRef"
              :schema="tableSchema"
              @row-click="handleRowClick"
            />
            <div v-else class="empty-state-mini">
              <span>等待 Schema 加载...</span>
            </div>
          </div>
        </div>

        <!-- 表单区域 -->
        <div class="component-section">
          <div class="section-header">
            <h3>动态表单</h3>
          </div>
          <div class="section-content">
            <schema-form
              v-if="formSchema"
              ref="schemaFormRef"
              :schema="formSchema"
            />
            <div v-else class="empty-state-mini">
              <span>等待 Schema 加载...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template> 

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue';
import { ElMessage } from 'element-plus';
import MonacoEditor from 'monaco-editor-vue3';
import SchemaForm from '$elpisWidgets/schema-form/schema-form.vue';
import SchemaSearchBar from '$elpisWidgets/schema-search-bar/schema-search-bar.vue';
import SchemaTable from '$elpisWidgets/schema-table/schema-table.vue';

// 配置 Monaco Editor 环境（禁用 worker 避免跨域问题）
if (typeof window !== 'undefined') {
  window.MonacoEnvironment = {
    getWorker() {
      return null;
    }
  };
}

/* ==================== Schema Demo 示例集合 ====================
 * 您可以复制以下任意示例到编辑器中查看效果
 * ============================================================== */

// 示例1: 电商商品管理
const demoSchema1 = {
  type: 'object',
  properties: {
    id: {
      label: 'ID',
      type: 'string',
      tableOption: {
        width: 80
      }
    },
    productName: {
      label: '商品名称',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '请输入商品名称'
      },
      tableOption: {
        width: 200
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入商品名称'
      }
    },
    price: {
      label: '价格',
      type: 'number',
      searchOption: {
        comType: 'input',
        placeholder: '请输入价格'
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入价格'
      }
    },
    inventory: { 
      label: '库存', 
      type: 'number',
      searchOption: {
        comType: 'select', 
        enumList: [
          { label: '全部', value: -999 },
          { label: '100', value: 100 }, 
          { label: '1000', value: 1000 }, 
          { label: '10000', value: 10000 }
        ] 
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'select', 
        enumList: [
          { label: '100', value: 100 }, 
          { label: '1000', value: 1000 }, 
          { label: '10000', value: 10000 }
        ]
      }
    },
    status: {
      label: '状态',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '在售', value: 'active' },
          { label: '下架', value: 'inactive' },
          { label: '缺货', value: 'out_of_stock' }
        ]
      },
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '在售', value: 'active' },
          { label: '下架', value: 'inactive' },
          { label: '缺货', value: 'out_of_stock' }
        ]
      }
    },
    description: {
      label: '商品描述',
      type: 'string',
      tableOption: {
        'show-overflow-tooltip': true
      },
      createFormOption: {
        comType: 'textarea',
        placeholder: '请输入商品描述'
      }
    }
  }
};

// 示例2: 用户管理系统
const demoSchema2 = {
  type: 'object',
  properties: {
    id: {
      label: '用户ID',
      type: 'string',
      tableOption: {
        width: 100
      }
    },
    username: {
      label: '用户名',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入用户名搜索'
      },
      tableOption: {
        width: 150
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入用户名',
        required: true
      }
    },
    email: {
      label: '邮箱',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入邮箱搜索'
      },
      tableOption: {
        width: 200
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入邮箱地址'
      }
    },
    role: {
      label: '角色',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '管理员', value: 'admin' },
          { label: '普通用户', value: 'user' },
          { label: '访客', value: 'guest' }
        ]
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '管理员', value: 'admin' },
          { label: '普通用户', value: 'user' },
          { label: '访客', value: 'guest' }
        ]
      }
    },
    age: {
      label: '年龄',
      type: 'number',
      tableOption: {
        width: 80
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入年龄'
      }
    },
    registerDate: {
      label: '注册日期',
      type: 'string',
      tableOption: {
        width: 150
      }
    }
  }
};

// 示例3: 课程管理
const demoSchema3 = {
  type: 'object',
  properties: {
    courseId: {
      label: '课程编号',
      type: 'string',
      tableOption: {
        width: 120
      }
    },
    courseName: {
      label: '课程名称',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '搜索课程名称'
      },
      tableOption: {
        width: 200
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入课程名称',
        required: true
      }
    },
    teacher: {
      label: '授课老师',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入老师姓名'
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入老师姓名'
      }
    },
    category: {
      label: '课程类别',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '编程', value: 'programming' },
          { label: '设计', value: 'design' },
          { label: '数据分析', value: 'data' },
          { label: '市场营销', value: 'marketing' }
        ]
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '编程', value: 'programming' },
          { label: '设计', value: 'design' },
          { label: '数据分析', value: 'data' },
          { label: '市场营销', value: 'marketing' }
        ]
      }
    },
    price: {
      label: '课程价格',
      type: 'number',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: -999 },
          { label: '免费', value: 0 },
          { label: '￥99', value: 99 },
          { label: '￥299', value: 299 },
          { label: '￥999', value: 999 }
        ]
      },
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入价格'
      }
    },
    duration: {
      label: '课时数',
      type: 'number',
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入课时数'
      }
    },
    description: {
      label: '课程简介',
      type: 'string',
      tableOption: {
        'show-overflow-tooltip': true
      },
      createFormOption: {
        comType: 'textarea',
        placeholder: '请输入课程简介'
      }
    }
  }
};

// 示例4: 订单管理
const demoSchema4 = {
  type: 'object',
  properties: {
    orderId: {
      label: '订单号',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入订单号搜索'
      },
      tableOption: {
        width: 180
      }
    },
    customerName: {
      label: '客户姓名',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入客户姓名'
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入客户姓名'
      }
    },
    orderStatus: {
      label: '订单状态',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '待付款', value: 'pending' },
          { label: '已付款', value: 'paid' },
          { label: '配送中', value: 'shipping' },
          { label: '已完成', value: 'completed' },
          { label: '已取消', value: 'cancelled' }
        ]
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '待付款', value: 'pending' },
          { label: '已付款', value: 'paid' },
          { label: '配送中', value: 'shipping' },
          { label: '已完成', value: 'completed' }
        ]
      }
    },
    totalAmount: {
      label: '订单金额',
      type: 'number',
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入订单金额'
      }
    },
    paymentMethod: {
      label: '支付方式',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '支付宝', value: 'alipay' },
          { label: '微信', value: 'wechat' },
          { label: '银行卡', value: 'card' },
          { label: '货到付款', value: 'cod' }
        ]
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '支付宝', value: 'alipay' },
          { label: '微信', value: 'wechat' },
          { label: '银行卡', value: 'card' },
          { label: '货到付款', value: 'cod' }
        ]
      }
    },
    orderDate: {
      label: '下单时间',
      type: 'string',
      tableOption: {
        width: 150
      }
    },
    remark: {
      label: '备注',
      type: 'string',
      tableOption: {
        'show-overflow-tooltip': true
      },
      createFormOption: {
        comType: 'textarea',
        placeholder: '请输入备注信息'
      }
    }
  }
};

// 示例5: 员工管理
const demoSchema5 = {
  type: 'object',
  properties: {
    employeeId: {
      label: '员工编号',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入员工编号'
      },
      tableOption: {
        width: 120
      }
    },
    name: {
      label: '姓名',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入姓名搜索'
      },
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入姓名',
        required: true
      }
    },
    department: {
      label: '部门',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '技术部', value: 'tech' },
          { label: '产品部', value: 'product' },
          { label: '运营部', value: 'operation' },
          { label: '市场部', value: 'marketing' },
          { label: '人事部', value: 'hr' }
        ]
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '技术部', value: 'tech' },
          { label: '产品部', value: 'product' },
          { label: '运营部', value: 'operation' },
          { label: '市场部', value: 'marketing' },
          { label: '人事部', value: 'hr' }
        ]
      }
    },
    position: {
      label: '职位',
      type: 'string',
      tableOption: {
        width: 150
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入职位'
      }
    },
    salary: {
      label: '薪资',
      type: 'number',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: -999 },
          { label: '5-10K', value: 7500 },
          { label: '10-20K', value: 15000 },
          { label: '20-30K', value: 25000 },
          { label: '30K+', value: 35000 }
        ]
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入薪资'
      }
    },
    entryDate: {
      label: '入职日期',
      type: 'string',
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: 'YYYY-MM-DD'
      }
    },
    skills: {
      label: '技能描述',
      type: 'string',
      tableOption: {
        'show-overflow-tooltip': true
      },
      createFormOption: {
        comType: 'textarea',
        placeholder: '请输入技能描述'
      }
    }
  }
};

// 示例6: 图书管理
const demoSchema6 = {
  type: 'object',
  properties: {
    isbn: {
      label: 'ISBN',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入ISBN'
      },
      tableOption: {
        width: 150
      }
    },
    bookName: {
      label: '书名',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入书名搜索'
      },
      tableOption: {
        width: 200
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入书名',
        required: true
      }
    },
    author: {
      label: '作者',
      type: 'string',
      searchOption: {
        comType: 'input',
        placeholder: '输入作者姓名'
      },
      tableOption: {
        width: 120
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入作者'
      }
    },
    category: {
      label: '分类',
      type: 'string',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: '' },
          { label: '科技', value: 'tech' },
          { label: '文学', value: 'literature' },
          { label: '历史', value: 'history' },
          { label: '经济', value: 'economics' },
          { label: '艺术', value: 'art' }
        ]
      },
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'select',
        enumList: [
          { label: '科技', value: 'tech' },
          { label: '文学', value: 'literature' },
          { label: '历史', value: 'history' },
          { label: '经济', value: 'economics' },
          { label: '艺术', value: 'art' }
        ]
      }
    },
    price: {
      label: '价格',
      type: 'number',
      searchOption: {
        comType: 'input',
        placeholder: '输入价格'
      },
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入价格'
      }
    },
    stock: {
      label: '库存',
      type: 'number',
      searchOption: {
        comType: 'select',
        enumList: [
          { label: '全部', value: -999 },
          { label: '有货', value: 100 },
          { label: '少量', value: 10 },
          { label: '无货', value: 0 }
        ]
      },
      tableOption: {
        width: 100
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入库存数量'
      }
    },
    publisher: {
      label: '出版社',
      type: 'string',
      tableOption: {
        width: 150
      },
      createFormOption: {
        comType: 'input',
        placeholder: '请输入出版社'
      }
    },
    summary: {
      label: '简介',
      type: 'string',
      tableOption: {
        'show-overflow-tooltip': true
      },
      createFormOption: {
        comType: 'textarea',
        placeholder: '请输入图书简介'
      }
    }
  }
};

// 默认使用示例1（电商商品管理）
const defaultSchema = demoSchema1;

/* ==================== 其他示例数据 ====================
 * 使用方法：将 defaultSchema 改为其他示例
 * 例如：const defaultSchema = demoSchema2;
 * ====================================================== */

// Demo 列表
const demoList = [
  { label: '示例1: 电商商品管理', value: 'demo1' },
  { label: '示例2: 用户管理系统', value: 'demo2' },
  { label: '示例3: 课程管理', value: 'demo3' },
  { label: '示例4: 订单管理', value: 'demo4' },
  { label: '示例5: 员工管理', value: 'demo5' },
  { label: '示例6: 图书管理', value: 'demo6' }
];

// Schema 映射
const schemaMap = {
  demo1: demoSchema1,
  demo2: demoSchema2,
  demo3: demoSchema3,
  demo4: demoSchema4,
  demo5: demoSchema5,
  demo6: demoSchema6
};

// Refs（在 defaultSchema 定义之后）
const currentDemo = ref('demo1'); // 默认示例3
const schemaFormRef = ref(null);
const searchBarRef = ref(null);
const tableRef = ref(null);
const jsonSchemaText = ref(JSON.stringify(defaultSchema, null, 2));
const searchSchema = ref(null);
const tableSchema = ref(null);
const formSchema = ref(null);
const parseError = ref('');
const searchValues = ref(null);
let parseInterval = null;

// Monaco Editor 配置
const editorTheme = ref('vs-dark');

// 编辑器挂载前的配置
const handleEditorWillMount = (monaco) => {
  // 禁用 JSON 语言服务以避免 worker 问题
  monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
    validate: false,
    schemas: []
  });
};

// 切换示例
const switchDemo = (demoKey) => {
  const selectedSchema = schemaMap[demoKey];
  if (selectedSchema) {
    jsonSchemaText.value = JSON.stringify(selectedSchema, null, 2);
    // 立即解析
    nextTick(() => {
      parseSchema(jsonSchemaText.value);
    });
  }
};

// 处理搜索
const handleSearch = (searchParams) => {
  searchValues.value = searchParams;
  console.log('搜索参数:', searchParams);
};

// 处理表格行点击
const handleRowClick = (row) => {
  console.log('选中行:', row);
};

// 通用构建 schema 方法（清除噪音）
const buildDtoSchema = (_schema, comName) => {
  if (!_schema?.properties) { return {}; }

  const dtoSchema = {
    type: 'object',
    properties: {}
  }

  // 提取有效 schema 字段信息
  for (const key in _schema.properties) {
    const props = _schema.properties[key];
    if (props[`${comName}Option`]) {
      let dtoProps = {};

      // 提取 props 中非 option 的部分，存放到 dtoProps 中
      for (const pKey in props) {
        if (pKey.indexOf('Option') < 0) {
          dtoProps[pKey] = props[pKey];
        }
      }

      // 处理 comName Option
      dtoProps = Object.assign({}, dtoProps, { option: props[`${comName}Option`] });
      
      // 处理 required 字段
      const { required } = _schema;  
      if (required && required.find(pk => pk === key)) {
        dtoProps.option.required = true;
      }

      dtoSchema.properties[key] = dtoProps;
    }
  }
  
  return dtoSchema;
}

// 解析 JSON Schema
const parseSchema = (value) => {
  const editorValue = value || jsonSchemaText.value;

  if (!editorValue.trim()) {
    return;
  }
  
  try {
    parseError.value = '';
    const schema = JSON.parse(editorValue);
    
    // 验证基本结构
    if (!schema.type) {
      throw new Error('Schema 必须包含 type 字段');
    }

    searchSchema.value = {};
    tableSchema.value = {};
    formSchema.value = {};
    nextTick(() => {
      // 分别构建三个 schema
      searchSchema.value = buildDtoSchema(schema, 'search');
      tableSchema.value = buildDtoSchema(schema, 'table');
      formSchema.value = buildDtoSchema(schema, 'createForm');
    });
  } catch (error) {
    console.log(error);
    parseError.value = `解析错误: ${error.message}`;
  }
};

// 生命周期
onMounted(() => {
  parseSchema();
});
</script>

<style lang="less" scoped>
.json-schema-demo {
  padding: 20px;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: #f5f7fa;
  overflow: hidden;
  box-sizing: border-box;
}

.demo-header {
  flex-shrink: 0;
  margin-bottom: 20px;
  padding: 15px 20px;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  
  h2 {
    margin: 0;
    font-size: 24px;
    color: #303133;
  }
}

.demo-content {
  flex: 1;
  display: flex;
  gap: 20px;
  overflow: hidden;
  min-height: 0;
}

.left-panel {
  flex: 0.5;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.right-panel {
  flex: 1;
  background: white;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  
  > .panel-header {
    flex-shrink: 0;
  }
  
  // 右侧内容区域可滚动
  > .component-section:first-of-type {
    margin-top: 15px;
  }
  
  > .component-section {
    flex-shrink: 0;
    margin-bottom: 15px;
  }
  
  // 让右侧可以滚动
  overflow-y: auto;
  overflow-x: hidden;
}

  .panel-header {
    flex-shrink: 0;
    padding: 15px 20px;
    border-bottom: 1px solid #ebeef5;
    display: flex;
    justify-content: space-between;
    align-items: center;
    
    h3 {
      margin: 0;
      font-size: 18px;
      color: #303133;
    }
    
    .panel-tips {
      font-size: 12px;
      color: #909399;
    }
    
    .demo-selector {
      width: 220px;
    }
  }

.component-section {
  flex-shrink: 0;
  background: #000000;
  border-radius: 4px;
  box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  overflow: hidden;
  
  .section-header {
    padding: 12px 20px;
    background: #1a1a1a;
    border-bottom: 1px solid #333333;
    
    h3 {
      margin: 0;
      font-size: 16px;
      color: #ffffff;
      font-weight: 600;
    }
  }
  
  .section-content {
    padding: 15px 20px;
    max-height: 400px;
    overflow-y: auto;
    background: #000000;
    
    &.table-wrapper {
      max-height: 350px;
    }
    
    // 确保表单是单列垂直布局
    :deep(.schema-form),
    :deep(form) {
      display: flex;
      width: 100%;
      
      .form-item,
      .el-form-item {
        width: 100%;
        min-width: 230px;
        margin-bottom: 15px;
      }
    }
  }
  
  .section-output {
    padding: 10px 20px;
    background: #0a0a0a;
    border-top: 1px solid #333333;
    font-size: 12px;
    
    strong {
      color: #cccccc;
    }
    
    .output-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    
    pre {
      margin: 8px 0 0 0;
      padding: 8px;
      background: #1a1a1a;
      border: 1px solid #333333;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
      font-size: 11px;
      line-height: 1.5;
      color: #e0e0e0;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 150px;
      overflow-y: auto;
    }
  }
}

.json-editor {
  flex: 1;
  padding: 0;
  overflow: hidden;
  display: flex;
  
  :deep(.monaco-editor-vue3) {
    flex: 1;
    height: 100%;
  }
  
  :deep(.editor-container) {
    height: 100%;
  }
}

.error-message {
  flex-shrink: 0;
  padding: 15px;
  border-top: 1px solid #ebeef5;
}

.empty-state-mini {
  text-align: center;
  padding: 20px;
  color: #888888;
  font-size: 13px;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: #909399;
  
  i {
    font-size: 64px;
    margin-bottom: 20px;
    opacity: 0.5;
  }
  
  p {
    font-size: 14px;
  }
}

:deep(.el-select__placeholder) {
  color: #545454
}

</style>