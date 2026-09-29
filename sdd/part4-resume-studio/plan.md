# Part4 · Resume Studio — 实施计划（plan）

> 回答「准备怎么做」。做成什么样见 [spec.md](./spec.md)；任务排期见 [tasks.md](./tasks.md)。

---

## 总策略

先把 **elpis 框架收束成可发布的产品基座**（2.0），此后 Part4 每一节 **只做三件事之一**：

1. 往约定目录 **放一份声明**（Agent / Skill / Prompt / MCP / rubric / fixture）；
2. 在 **demo** 加页面或业务 API；
3. 用某种语言 **写一个 MCP Server** 并通过声明挂载。

**节奏一行：**

> 还债 → 画蓝图 → 低代码出两个库 → 按层造零件 → 两块分析成形 → 组队跑串并行 → 上图 → 收束发版

对应视频课 **V29–V36**，任务 **T14–T21**（V28 不占行，见 [tasks.md](./tasks.md)）。

---

## 关键决策

每条 **一句理由**；均受 [spec.md §5 产品决策](./spec.md#5-产品决策定死后面所有节都受它约束) 约束。

| 决策 | 理由 |
|------|------|
| **先剥合同再删实现** | 稳定面（HTTP 三字段 / SSE 三事件 / Store / 扫描）先锁类型与目录，再删 Part3 实验代码，避免删错接口 |
| **llm 收缩不删除** | Provider 层保留 mock/local/remote 切换能力，只删 demo 未引用分支，保证课堂可离线 |
| **新建 `war-room` model 树，不挂 `agent/lab`** | Resume Studio 是独立产品项目，与 Part3 实验室菜单/路由隔离 |
| **列表走 schema，分析页走 custom** | 两个库复用低代码 schema CRUD/只读；分析报告交互复杂，走 custom 一按钮两板块 |
| **两个库用课里已有 MySQL `zteam`，不另起 H2** | 与 config 已有连接一致，避免「课上演 MySQL、作业用 sqlite」双轨 |
| **三个 MCP Server，框架侧零改动** | Python 解析 · Java 算分 · Go 召回均 MCP 声明挂载，框架不嵌入 Python/Java/Go 运行时 |
| **三种语言环境门槛放在各自 MCP 那节开头验** | 每节开头当堂 `python --version` / `java -version` / `go version`，不过不继续，避免讲到一半翻车 |
| **确定性的活不交给模型** | 算术、加权、阈值比较进 Java 规则引擎；模型只出逐条判定 |
| **召回与精排：4000 条判定降到 400** | 全库 150–300 岗位 × 多维度粗匹配 ≈ 4000 次候选判定，Go 召回 + Java 精排压到 400 再交给 LLM 细判 |
| **岗位库双出口** | Java 读同一份 `t_job`：页面列表走 schema，Agent 走 MCP；HTTP 留给 curl / 存量对照，**不做岗位详情页** |
| **规则配置化** | 权重、阈值、级别映射放表或配置，改权重不改代码 |
| **rubric 按级别切** | 初级/中级/高级/专家各一套 rubric 片段，检索注入而非整包塞 prompt |
| **特遣队只在职责真冲突时拆** | 默认一个「简历分析队长」Agent；仅当 prompt 职责无法共存时再拆子 Agent |
| **串行并行由依赖决定** | 解析 → 打分 → 召回 → 精排有数据依赖处串行；无依赖的 MCP（如预加载 rubric）可并行 |
| **队长是普通 Agent 声明，不是第二种运行时** | 不实现 supervisor 循环框架；队长用按名互调 + 并行委派原语编排 |
| **断言全是行为轨迹** | eval 断言 `stepsContain` / `outputContains`，不断言模型措辞 |
| **失败要可降级** | 任一 MCP 超时/失败时，报告页展示已完成板块 + 明确错误，不白屏 |

---

## 状态落点

| 数据 | 落点 | 是否进 git | 说明 |
|------|------|------------|------|
| `t_resume` | MySQL `zteam` | **否** | 入库真源；列表 schema 读写 |
| `t_job` | MySQL `zteam` | **否** | 入库真源；150–300 条 SQL 种子导入 |
| `t_job_requirement` | MySQL `zteam` | **否** | Python MCP 从 JD 正文抽取后写入 |
| fixtures / knowledge-rubric / jobs 种子 SQL | `data/fixtures/` 等 | **是** | 可复现课堂环境 |
| 简历原文件 | `data/resumes/` | **否** | **隐私**；仅本地/uploads 落盘 |
| vector 索引 | `data/vector/` | **否** | 体积大且可重建；`.gitkeep` 占位即可 |

---

## 页面策略

Resume Studio（`proj_key=war-room`）只需 **三个 ECharts 组件**：

| 组件 | 用途 |
|------|------|
| 雷达图 | 六维度 0–100 画像 |
| 仪表盘 | 综合分展示 |
| 横向条形图 | Top 10 岗位匹配度排序 |

其余 UI 为 **卡片 + 列表**（schema 列表、推荐岗位卡片、证据折叠面板）。不引入新 chart 库。

---

## 按层造零件（MCP 与 Agent 分工）

与 [spec.md §6 语言分工](./spec.md#6-语言分工表) 对应，零件清单：

| 零件 | 语言 | 输入 → 输出 |
|------|------|-------------|
| `resume-parser` MCP | Python | 文件路径 → `t_resume` 结构化字段 |
| `jd-extractor` MCP | Python | JD 正文 → `t_job_requirement` 结构化字段 |
| `score-engine` MCP | Java | 判定 JSON + 岗位权重 → 六维分 + 综合分 |
| `job-recall` MCP | Go | 简历向量/关键词 + 全库 → Top 20 粗排 |
| `job-rerank` MCP | Go/Java | Top 20 → 精排 400 候选 → Top 10 |
| 简历分析队长 Agent | Node/TS | 编排上述 MCP，写 trace，推 SSE |

---

## 两块分析如何成形

1. **简历画像块：** 队长串行调用 Python 解析 → Java 算六维 → 汇总 rubric 证据 → custom 页雷达/仪表盘。
2. **岗位推荐块：** Go 召回 Top 20 → 并行 Java 精排 + LLM 逐条判定（4000→400）→ Top 10 卡片。

依赖关系见 [tasks.md V33–V34](./tasks.md#任务表-t14t21)。

---

## 组队串并行

```
[Python 解析] ──→ [Java 六维打分] ──→ [画像块 SSE delta]
                         ↓
              [Go 召回 Top20] ──→ [精排 400] ──→ [Top10 推荐块]
```

- **串行：** 解析完成后再打分；打分完成后再召回（需结构化简历字段）。
- **并行：** rubric 预加载 ∥ 解析；Top20 粗排 ∥ 六维打分（若字段已够）。

队长通过 **按名互调 + 并行委派** 原语实现，不用第二套 supervisor 运行时。

---

## 发版

- **`npm publish` 是对稳定面的公开承诺**：2.0 起 contracts / Store / SSE 视为 semver 公共 API。
- **2.0 三个 breaking change：**
  1. HTTP 响应统一为三字段 `{ ok, data, error }`（旧两字段弃用）；
  2. SSE 事件统一为 `step | delta | done`（旧事件名弃用）；
  3. Agent 扫描目录收敛，旧路径声明需迁移到 `app/agents/` 约定。

发版前跑通 [tasks.md § 收口验收](./tasks.md#收口验收) 六条。

---

## Part4 对 elpis 的改动范围

仅 [spec.md §8](./spec.md#8-本-part-允许改-elpis-的三类事) 三类；具体任务在 **T14 / V29** 落地，不在后续节重复改框架。

---

## 与 Part3 的衔接

- Part3（`lab` 项目）保留 Agent Trace / eval / RAG 演示，**不挂 Resume Studio 菜单**。
- Part4 eval 用例新建 `resume-studio.cases.ts`（或同级），断言风格与 Part3 一致：`stepsContain` 行为轨迹。
- T13（Part3 末）已完成 Agent Runtime 基座；T14 起接 Resume Studio（见 [tasks.md](./tasks.md)）。
