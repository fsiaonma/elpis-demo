# project-config-guide · 项目 model 配置指南

docId: project-config-guide

## jd 项目 homePage 契约

京东项目（`proj_key=jd`）的 homePage 必须写成：

`/schema?proj_key=jd&key=product`

对应 model 文件：`model/buiness/project/jd.js`。

## 禁止双路径

所有项目的 `homePage` 与 `customConfig.path` **不得**包含 `/view/dashboard` 前缀。

- 正确：`/schema?proj_key=jd&key=product`
- 错误：`/view/dashboard/schema?proj_key=jd&key=product`

框架会在导航时自动加上 dashboard basename；业务配置只写相对 dashboard 的路径与 query。

## 与 Agent 实验室的关系

Agent 实验室（见 `elpis-agent-lab.md`）使用同一套 homePage 纪律：实验室首页为 `/agent?proj_key=lab&key=project-assistant-chat`，同样禁止 `/view/dashboard` 前缀。
