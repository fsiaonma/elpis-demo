# elpis-demo

基于 [@fsiaonma/elpis](https://www.npmjs.com/package/@fsiaonma/elpis) 的示例业务项目：传统 Vue 页面 + Nest 风格 TypeScript 模块（`app/modules`），并包含 Agent / Skill / Prompt / LLM Provider / Eval 等 AI 实验室能力。

## 环境要求

- **Node.js** 22.x（建议 22.22.0）
- **MySQL**：与 `config/config.default.js` 中 `db` 一致，或在 `config/config.local.js` 覆盖
- **elpis 源码**：与 demo **同级**目录 `../elpis`（见下方说明）

## 目录约定（重要）

`tsconfig.json` 的 `paths` 依赖同级 **`../elpis`**（Nest 依赖、`dist/nest-public` 等）。推荐：

```text
~/dy-workspace/
├── elpis/
└── elpis-demo/    # 本仓库
```

克隆到其他路径时，请调整 `tsconfig.json` 的 `paths`，或建立指向本机 elpis 的符号链接。

源码编译输出（均在 `.gitignore` 的 `dist/` 下）：

| 源码目录 | 编译产物 |
|----------|----------|
| `app/modules/` | `dist/modules/` |
| `app/agents/` | `dist/agents/` |
| `app/skills/` | `dist/skills/` |
| `app/prompts/` | `dist/prompts/` |
| `app/llm-providers/` | `dist/llm-providers/` |
| `app/eval/` | `dist/eval/` |

约定说明见各目录内 `README.md`（如 `app/agents/README.md`）。

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 准备并链接 elpis

```bash
cd ../elpis          # 例如 ~/dy-workspace/elpis
npm install
npm run build        # 生成 dist/nest-public，供 demo 的 tsc 使用
npm link

cd ../elpis-demo
npm link @fsiaonma/elpis
```

恢复 registry 版本：`npm unlink @fsiaonma/elpis && npm install`（仍须保证 `../elpis` 满足 `tsconfig` 路径，否则 `build:modules` 会失败）。

### 3. 配置 `config/config.local.js`

已在 `.gitignore` 中，用于覆盖本地密钥（LLM / embedding 的 `apiKey` 等）。模板字段见 `config/config.default.js` 的 `ai` 段；勿将真实密钥提交 Git。

### 4. 启动前端 Webpack（单独终端，保持运行）

```bash
npm run build:dev
```

Webpack 开发服务默认 **9002**，等待初次构建完成。

### 5. 启动后端（另开终端）

```bash
npm run dev
```

会依次：编译 TS 模块 → 并行 `tsc -w` 与 `nodemon`（监听 `dist/modules` 等）。后端默认 **8080**。

- 业务首页：`http://localhost:8080/view/project-list`
- Dashboard 内可访问 Agent、Trace、Eval 等实验页面（见 `app/pages/dashboard/`）

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run build:modules` | 一次性编译 `app/` 下 TS（modules、agents、skills 等） |
| `npm run build:modules:watch` | 仅 TS 监听编译（通常随 `dev` 启动） |
| `npm run build:prod` | 生产环境前端构建 |
| `npm run prod` | `build:modules` + production 启动 |
| `npm run beta` | beta 环境（`PORT=8081`） |
| `npm run eval` | Agent 评测 CLI（需后端已启动且已 `build:modules`） |

### Agent 评测（`npm run eval`）

1. 终端 A：`npm run dev`（或至少保证 `8080` 可访问 `/api/ai`）
2. 终端 B：`npm run build:modules`（若尚未编译 eval cases）
3. 终端 B：`npm run eval`

用例 glob、报告路径见 `config/config.default.js` → `ai.eval`（默认 `dist/eval/*.cases.js`、`./data/eval/report.json`）。请求签名逻辑见 `scripts/sign-headers.js`。

## 本地数据与忽略规则

运行时数据目录（Git 仅保留占位文件，见 `.gitignore`）：

- `data/trace/` — Trace JSON
- `data/memory/` — 会话记忆 JSON
- `data/vector/` — 向量存储文件

`config/config.default.js` 中 `ai.mcp` 默认启用 filesystem MCP（`npx @modelcontextprotocol/server-filesystem`），按需安装网络与 Node 环境。

## 从其他机器同步代码时

若从 `~/dy-workspace/elpis-demo` 拷贝到本仓库，通常**不会**复制：`node_modules/`、`dist/`、`app/public/dist/`、`logs/`、`*.log`、`.DS_Store`、以及 `data/trace|memory` 下的 `*.json` 与 `data/vector/*` 内运行时文件（`.gitkeep` 会保留）。拷贝后在本目录执行 `npm install`，并按上文步骤链接 elpis、配置 `config.local.js`。
