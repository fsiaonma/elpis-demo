# elpis-agent-lab · Agent 实验室内部说明

docId: elpis-agent-lab

## 用途

Agent 实验室（`proj_key=lab`）是 Part3 Agent Runtime 的演示项目，用于验收 Chat、Trace、MCP 与 RAG 等能力。

## 菜单

| key | 名称 | 路由 |
|-----|------|------|
| project-assistant-chat | 项目助手 | /agent |
| agent-trace | Agent Trace | /trace |

## homePage 契约（仅本文档约定）

实验室项目默认首页：

`/agent?proj_key=lab&key=project-assistant-chat`

**禁止在 homePage 中使用 `/view/dashboard` 前缀。** 菜单路由由框架 basename 自动拼接；若在 homePage 再写 `/view/dashboard`，会出现双路径，顶部菜单高亮也会错乱。
