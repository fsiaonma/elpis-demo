# elpis-demo

基于 [@fsiaonma/elpis](https://www.npmjs.com/package/@fsiaonma/elpis) 的示例业务项目：Vue 管理端 + Nest 风格 TypeScript 模块，并包含 Agent / Skill / RAG / Eval 与 **Resume Studio**（简历分析实验室）等能力。

## 环境要求

### 必装（任何场景）

- **Node.js** 22.x（建议 22.22.0）
- **MySQL**（库 `zteam` 等，见 `config/config.default.js` → `db`；可用 `config/config.local.js` 覆盖）
- **elpis 源码**：与本项目**同级**的 `../elpis`（`tsconfig.json` 的 `paths` 指向其中的 Nest 依赖）

### 按功能选装

默认 `config/config.default.js` 里 **`ai.mcp.enabled: true`**，启动 `npm run dev` 时会**自动拉起**下面 4 个 MCP。任一可执行文件缺失，进程可能直接退出（例如 `spawn ./recall-go ENOENT`）。

| 你要做的事 | 是否需要 Java | 还需要 |
|------------|---------------|--------|
| 项目列表、登录、普通 CRUD、Dashboard 浏览 | **否**（建议在 `config.local.js` 关 MCP，见下文） | Node + MySQL + elpis |
| Agent / Eval / RAG（不走 Resume MCP） | **否**（同上可只留 `filesystem` 或关 MCP） | 有效 LLM / embedding 配置 |
| **Resume Studio**（解析简历、JD 入库、召回匹配） | **是** | 见下表 |

Resume 全链路 MCP 依赖：

| 运行时 | 用途 | 说明 |
|--------|------|------|
| **Java（JRE/JDK）** | `jd-store` | 运行 `mcp-servers/jd-store-java/target/jd-store.jar`。仓库里未必带 `target/`，需本机构建：`cd mcp-servers/jd-store-java && mvn -q package`（需 **Maven + JDK**，建议 17+） |
| **Go** | `recall` | 运行 `mcp-servers/recall-go/recall-go`（二进制在 `.gitignore`，需本机编译：`cd mcp-servers/recall-go && go build -o recall-go .`） |
| **uv + Python** | `resume-parser` | `cd mcp-servers/resume-parser-py`，按该目录依赖用 `uv run python server.py` |
| **Node（npx）** | `filesystem` | 首次会自动拉 `@modelcontextprotocol/server-filesystem` |

**结论：Java 不是写 demo 本身必需，但默认配置下 Resume / JD 相关能力需要 Java 来跑 `jd-store`。** 若暂时不用 Resume，可在 `config/config.local.js` 中设置 `ai: { mcp: { enabled: false } }`，则 **不需要 Java / Go / uv**，后端也能正常起来（Resume Studio 里依赖 MCP 的功能不可用）。

推荐目录：

```text
~/dy-workspace/
├── elpis/
└── elpis-demo/
```

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 准备并链接 elpis

```bash
cd ../elpis          # 例如 ~/dy-workspace/elpis
npm install
npm run build
npm link

cd ../elpis-demo
npm link @fsiaonma/elpis
```

恢复 npm 包：`npm unlink @fsiaonma/elpis && npm install`（`tsc` 仍依赖 `../elpis/node_modules` 中的 Nest 包路径）。

### 3. 配置 `config/config.local.js`

已在 `.gitignore` 中。用于覆盖 LLM / embedding 的 `apiKey` 等；字段参考 `config/config.default.js` 的 `ai` 段。**勿提交真实密钥。**

### 4. 编译 TypeScript 模块（首次或拉代码后）

```bash
npm run build:modules
```

`config/config.default.js` 启动时会 `require` `dist/llm-providers`、`dist/rag` 等，需先有一次成功编译。

### 5. 启动前端 Webpack（单独终端，保持运行）

```bash
npm run build:dev
```

Webpack 开发服务默认 **9002**，等待初次构建完成。

### 6. 启动后端（另开终端）

```bash
npm run dev
```

等价于：`build:modules` → 并行 `tsc -w` + `nodemon`（监听 `dist/modules` 等）。后端默认 **8080**。

| 入口 | URL |
|------|-----|
| 项目列表 | http://localhost:8080/view/project-list |
| Dashboard / Eval / Trace / Agent | 见 `app/pages/dashboard/router.js` |
| Resume Studio | Dashboard 内 `resume-studio` 路由 |

## 源码与编译产物

| 源码 | 输出 |
|------|------|
| `app/modules/` | `dist/modules/` |
| `app/agents/` | `dist/agents/` |
| `app/skills/` | `dist/skills/` |
| `app/prompts/` | `dist/prompts/` |
| `app/llm-providers/` | `dist/llm-providers/` |
| `app/rag/` | `dist/rag/` |
| `app/eval/` | `dist/eval/` |

约定见各子目录 `README.md`（如 `app/agents/README.md`）。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run build:modules` | 一次性编译上述 TS |
| `npm run build:modules:watch` | TS 监听（随 `dev` 启动） |
| `npm run build:prod` | 生产前端构建 |
| `npm run prod` | `build:modules` + production 启动 |
| `npm run beta` | beta（`PORT=8081`） |
| `npm run eval` | Agent 评测 CLI（需服务已起、`build:modules` 已完成） |
| `npm run index:rubric` | 将 `data/knowledge/rubric/` 分级标准写入向量库（依赖 embedding 配置） |

### 评测 `npm run eval`

1. `npm run dev`（或保证 `ai.eval.apiBase` 可访问，默认 `http://localhost:8080/api/ai`）
2. `npm run eval` → 报告默认 `./data/eval/report.json`

签名头逻辑：`scripts/sign-headers.js`。

### RAG 分级标准 `npm run index:rubric`

Markdown 源文件在 `data/knowledge/rubric/`。索引前请在 `config.local.js` 中配置有效 embedding `apiKey`，并确保 `ai.store.vector` 路径可写（默认 `./data/vector`）。

## MCP 与 Resume Studio

配置入口：`config/config.default.js` → `ai.mcp`（可用 `config.local.js` 覆盖）。

| 名称 | 工作目录 | 启动命令（框架代劳） |
|------|----------|----------------------|
| `filesystem` | 项目根 | `npx … @modelcontextprotocol/server-filesystem .` |
| `resume-parser` | `mcp-servers/resume-parser-py` | `uv run python -u server.py` |
| `jd-store` | `mcp-servers/jd-store-java` | `java -jar target/jd-store.jar`（MySQL 与 `db` / `MYSQL_*` 环境变量一致） |
| `recall` | `mcp-servers/recall-go` | `./recall-go` |

### 首次准备 MCP 产物（Resume 全功能）

```bash
# JD 存储（需要 Java + Maven）
cd mcp-servers/jd-store-java
mvn -q package    # 生成 target/jd-store.jar

# 召回服务（需要 Go）
cd ../recall-go
go build -o recall-go .

# 简历解析（需要 uv）
cd ../resume-parser-py
uv sync           # 若项目使用 uv 锁文件；否则按该目录说明安装依赖
```

### 暂时关闭 MCP（免 Java / Go / uv）

在 `config/config.local.js` 中：

```js
module.exports = {
  ai: {
    mcp: { enabled: false },
  },
};
```

或只去掉用不到的服务（例如删掉 `recall` 条目），避免缺二进制导致启动失败。

### 常见启动错误

| 报错 | 含义 | 处理 |
|------|------|------|
| `spawn ./recall-go ENOENT` | 未编译 `recall-go` | 在 `mcp-servers/recall-go` 执行 `go build -o recall-go .` |
| `MCP_DISCONNECTED` | 某个 MCP 进程异常退出 | 看日志里是哪一个 server，补构建或从 `ai.mcp.servers` 移除 |
| `java … jd-store.jar` 失败 | 无 Java 或 jar 不存在 | 安装 JDK，`mvn package` 生成 jar |

## Git 忽略与本地数据

见 `.gitignore`，主要包括：

- `node_modules/`、`dist/`、`app/public/dist/`、`logs/`、`*.log`
- `config.local.js`
- `data/trace/*.json`、`data/memory/*.json`、`data/vector/*`（保留 `.gitkeep`）
- `data/resumes/`（上传简历落盘目录）

从 `~/dy-workspace/elpis-demo` 同步到本仓库时，同样不会复制上述运行时/依赖目录；同步后在本目录执行 `npm install` 并按上文链接 elpis、配置 `config.local.js`。
