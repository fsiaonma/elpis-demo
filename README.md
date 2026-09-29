# elpis-demo

基于 [@fsiaonma/elpis](https://www.npmjs.com/package/@fsiaonma/elpis) 的示例业务项目。

## 环境要求

- **Node.js**（建议 22.22.0）
- **MySQL**：本地库表与账号需与 `config/config.default.js` 中 `db` 一致，或在 `config/config.local.js` 里覆盖

## 启动步骤

### 1. 安装依赖

```bash
npm install
```

### 2. 链接本地 elpis（可选）

仅在**同时开发 elpis 框架源码**时需要；只用 npm 上的 `@fsiaonma/elpis` 可跳过本步。

```bash
# 在 elpis 仓库根目录
cd /path/to/elpis
npm install
npm link

# 回到本项目
cd /path/to/elpis-demo
npm link @fsiaonma/elpis
```

恢复使用 npm 包时：`npm unlink @fsiaonma/elpis && npm install`。

### 3. 配置 `config/config.local.js`

该文件已在 `.gitignore` 中，需自行创建或从同事处拷贝，用于本地敏感配置（如 AI `apiKey`、embedding 等），会覆盖/合并默认配置。

可参考结构（请替换为自己的密钥，勿提交到 Git）：

```js
module.exports = {
  ai: {
    llm: { models: { /* ... */ } },
    embedding: { /* ... */ },
  },
  // 如需覆盖数据库等，也可在此配置 db: { ... }
};
```

数据库等公共项默认见 `config/config.default.js`。

### 4. 启动前端构建（开发态，需保持运行）

```bash
npm run build:dev
```

会启动 Webpack 开发服务（默认 **9002**），终端需**一直开着**，并等待控制台出现初次构建完成提示。

### 5. 启动后端服务（另开终端）

```bash
npm run dev
```

后端默认监听 **8080**（可用环境变量 `PORT` 修改）。浏览器访问：

- 首页：`http://localhost:8080/view/project-list`

## 其他常用命令

| 命令 | 说明 |
|------|------|
| `npm run build:prod` | 生产环境前端构建 |
| `npm run beta` | beta 环境启动（`PORT=8081`） |
| `npm run prod` | production 环境启动 |

## 说明

- 修改前端代码后，保持 `npm run build:dev` 运行即可热更新；大改动或首次拉代码后需先执行步骤 4。
- `mcp-servers/`、`data/` 等为扩展或本地数据目录，基础 Web 启动不依赖它们；若业务用到对应 MCP，需按子目录各自说明单独启动。
