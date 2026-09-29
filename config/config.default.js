const { MockProvider } = require('../dist/llm-providers/mock.provider');
const { LocalProvider } = require('../dist/llm-providers/local.provider');

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
  },
  ai: {
    llm: {
      default: 'qwen',
      models: {
        qwen: {
          provider: 'openai-compatible',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: 'qwen-plus',
          apiKey: 'xxxx',
        },
        deepseek: {
          provider: 'openai-compatible',
          baseURL: 'https://api.deepseek.com/v1',
          model: 'deepseek-chat',
          apiKey: 'xxxx',
        },
        mock: {
          use: MockProvider,
        },
        local: {
          use: LocalProvider,
        },
      },
    },
    runtime: {
      maxIterations: 5,
    },
    store: {
      trace: './data/trace',
      vector: {
        driver: 'file',
        path: './data/vector',
        fixturesPath: './data/fixtures',
      },
      memory: {
        driver: 'file',
        path: './data/memory',
        maxTurns: 20,
      },
    },
    embedding: {
      default: 'qwen',
      models: {
        qwen: {
          provider: 'openai-compatible',
          baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
          model: 'text-embedding-v3',
          apiKey: 'xxxx',
        },
      },
    },
    rag: {
      chunk: { size: 500, overlap: 80 },
      topK: 4,
      tool: {
        description: '从 elpis 知识库检索片段（实验室用途 · jd 项目契约）；回答必须引用 docId',
      },
    },
    mcp: {
      enabled: true,
      servers: [
        {
          name: 'filesystem',
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', '.'],
        },
      ],
    },
    agent: {
      threadEnabled: true,
    },
    guardrail: {
      blockedKeywords: ['删除所有数据库', 'drop database', 'rm -rf'],
      blockedPatterns: [/忽略以上.*要求/i],
    },
    eval: {
      casesGlob: 'dist/eval/*.cases.js',
      reportPath: './data/eval/report.json',
      apiBase: 'http://localhost:8080/api/ai',
    },
  },
}