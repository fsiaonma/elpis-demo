# app/prompts

System prompt 源码目录，由 `npm run build:modules` 编译到 `dist/prompts/`。

## 文件约定

- 文件名：`*.prompt.ts`
- 每个文件**导出** system prompt 字符串（默认导出或命名导出均可）
- 只放 prompt 文本，不写 Agent 编排或 Skill 执行逻辑

```ts
const systemPrompt = '...';

export default systemPrompt;
```
