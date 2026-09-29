# app/skills

业务 Skill 源码目录，由 `npm run build:modules` 编译到 `dist/skills/`。

## 文件约定

- 文件名：`*.skill.ts`
- 每个文件**默认导出**一个 `SkillDefinition` 对象
- 类型从 `@fsiaonma/elpis` 引入：

```ts
import type { SkillDefinition, SkillContext } from '@fsiaonma/elpis';
```

- `execute(input, ctx)` 的参数必须显式标注类型（禁止隐式 `any`）
- 只写 Skill 能力本身，不写 Agent 编排或 HTTP 逻辑
