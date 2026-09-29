# app/agents

业务 Agent 声明目录，由 `npm run build:modules` 编译到 `dist/agents/`。

## 文件约定

- 文件名：`*.agent.ts`
- 每个文件**默认导出**一个 `AgentDefinition` 对象
- 类型从 `@fsiaonma/elpis` 引入：

```ts
import type { AgentDefinition } from '@fsiaonma/elpis';
```

- Agent 是纯声明：声明使用哪些 skill / tool、prompt 引用等，**不含执行逻辑**
- 编排与执行由框架 Orchestrator 负责
