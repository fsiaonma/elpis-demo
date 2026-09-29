# elpis-demo

基于 [@fsiaonma/elpis](https://www.npmjs.com/package/@fsiaonma/elpis) 的示例业务项目。后端 API 使用 `app/modules` 下的 Nest 风格 TypeScript 模块，编译产物在 `dist/modules`。

## 环境要求

- **Node.js** 22.x（建议 22.22.0，与 `@types/node` 一致）
- **MySQL**：库表与账号需与 `config/config.default.js` 中 `db` 一致，或在 `config/config.local.js` 中覆盖

## 目录约定（重要）

`tsconfig.json` 里的 `paths` 指向**与本项目同级的 `elpis` 源码目录**（默认 `../elpis`），并依赖其中的 Nest 依赖与 `dist/nest-public`。推荐布局：

```text
workspace/
├── elpis/          # 框架源码
└── elpis-demo/     # 本仓库
```

若克隆路径不同，请修改 `tsconfig.json` 中的 `paths`，或在本地增加指向 `~/dy-workspace/elpis` 的符号链接。

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 准备并链接 elpis

本地开发需使用 elpis 源码（不仅 npm 包），并完成 Nest 侧构建：

```bash
cd ../elpis          # 或 cd ~/dy-workspace/elpis
npm install
npm run build        # 生成 dist/nest-public 等，供 demo 的 tsc 解析

npm link

cd ../elpis-demo     # 回到本项目
npm link @fsiaonma/elpis
```

仅使用 registry 上的 `@fsiaonma/elpis`、且不编译 `app/modules` 时，仍须保证 `tsconfig` 中的 `../elpis` 路径有效，否则 `npm run build:modules` 会失败。

恢复 npm 包：`npm unlink @fsiaonma/elpis && npm install`。

### 3. 配置 `config/config.local.js`

文件在 `.gitignore` 中，需自行维护，用于本地敏感项（AI `apiKey`、embedding 等）及可选的 `db` 覆盖。公共默认值见 `config/config.default.js`。

```js
module.exports = {
  ai: {
    llm: { models: { /* 各模型 apiKey */ } },
    embedding: { /* ... */ },
  },
};
```

### 4. 启动前端 Webpack（开发态，单独终端，保持运行）

```bash
npm run build:dev
```

Webpack 开发服务默认 **9002**，等待控制台初次构建完成后再访问页面。

### 5. 启动后端（另开终端）

```bash
npm run dev
```

该命令会：

1. 执行 `npm run build:modules`（`tsc` 将 `app/modules` 编译到 `dist/modules`）
2. 并行运行 `tsc -w` 与 `nodemon`（监听 `dist/modules` 变更）

后端默认 **8080**（环境变量 `PORT` 可改）。浏览器访问：

- `http://localhost:8080/view/project-list`

## 其他命令

| 命令 | 说明 |
|------|------|
| `npm run build:modules` | 一次性编译 TypeScript 模块 |
| `npm run build:modules:watch` | 仅监听编译模块（一般随 `npm run dev` 启动） |
| `npm run build:prod` | 生产环境前端构建 |
| `npm run prod` | 先 `build:modules` 再以 production 环境启动 |
| `npm run beta` | beta 环境（`PORT=8081`） |

## 说明

- `dist/`、`app/public/dist/`、`logs/`、`node_modules` 等不会纳入 Git，见 `.gitignore`。
- 改 `app/modules/**/*.ts` 后保存即可，由 `tsc -w` 重新编译；`nodemon` 会重启 Node 服务。
- 改 Vue 页面时保持 `npm run build:dev` 运行以热更新。
- `mcp-servers/`、`data/` 等为扩展能力；基础 Web 启动不依赖 MCP，按需参阅各子目录说明。
