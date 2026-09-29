const { MockProvider } = require('../dist/llm-providers/mock.provider');
const { LocalProvider } = require('../dist/llm-providers/local.provider');
const { RubricLevelChunker } = require('../dist/rag/rubric-level.chunker');

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
      maxIterations: 50,
    },
    store: {
      trace: './data/trace',
      vector: {
        driver: 'qdrant',
        url: 'http://127.0.0.1:6333',
        collection: 'rubric',
        compareCollection: 'rubric_bysize',
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
      topK: 3,
      chunker: {
        use: RubricLevelChunker,
      },
      tool: {
        description:
          '查询简历评估的分级标准；按维度与级别检索，回答必须引用返回的 docId 与原文片段',
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
        {
          name: 'resume-parser',
          command: 'uv',
          args: ['run', 'python', '-u', 'server.py'],
          env: {
            PYTHONUNBUFFERED: '1',
          },
          cwd: 'mcp-servers/resume-parser-py',
        },
        {
          name: 'jd-store',
          command: 'java',
          args: ['-jar', 'target/jd-store.jar'],
          cwd: 'mcp-servers/jd-store-java',
          env: {
            MYSQL_URL: 'jdbc:mysql://127.0.0.1:3306/zteam?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC',
            MYSQL_USER: 'root',
            MYSQL_PASSWORD: 'Sam@123456',
          },
        },
        {
          name: 'recall',
          command: './recall-go',
          args: [],
          cwd: 'mcp-servers/recall-go',
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