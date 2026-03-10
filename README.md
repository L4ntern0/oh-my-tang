# oh-my-tang-dynasty 三省六部

[中文版](./README_CN.md) | [英文版](./README_EN.md)

> **一个把“三省六部”治理思路实验性搬进 OpenCode 的插件。**
>
> **起草 → 复核 → 派发 → 执行 → 审计**

> [!IMPORTANT]
> **首发说明 / Experimental First Release**
> - `oh-my-tang-dynasty` 只是我对“三省六部”治理思路的一次实验性实践。第一次看到把这套官制映射到 AI 协作流程时，确实有种“惊为天人”的感觉，所以才有了这个仓库。
> - 这个项目带有很强的 vibe coding 色彩：主体代码、文档和结构大多由 AI 生成、整理与拼装，几乎没有经过传统意义上的人工精修。
> - 因此，它更适合被看作一个公开实验和思路样本，而不是经过充分工程验证的稳定产品；**不保证一定可运行、可复现，也不保证适用于你的具体环境或生产场景**。
> - **当前仅明确支持 OpenCode**；未来如果这个方向继续演化，也许会尝试扩展到 `Codex`、`Claude`、`Gemini`、`Kimi` 等更多 agent / runtime 生态，但这件事目前还没有承诺时间表。
> - 如果你在使用中遇到问题、发现文档缺口，或想一起把这个方向做得更稳，欢迎提交 [Issue](https://github.com/L4ntern0/oh-my-tang/issues) 或 PR。

**你会在这里看到**

- 一个围绕 `tang_process` 展开的治理式 OpenCode 工作流
- `tang_pipeline`、`tang_audit`、`tang_doctor`、`tang_config` 等 operator-facing 可观察性入口
- OpenCode runtime 执行与本地 fallback 并存的实验性实现
- 当前范围聚焦 OpenCode，本仓库暂时不是通用多平台 agent 框架

这是一个面向 [OpenCode](https://github.com/opencode-ai/opencode) 的多智能体编排插件，借用了中国古代 **三省六部制** 的治理隐喻，把“起草、审核、分发、执行、复审、审计”组织成一个可检查、可追踪的工作流。

> 你可以把它理解为一个带治理环路的 OpenCode 插件：**中书省起草、门下省审核、尚书省分发、六部执行，并在全过程保留 audit / fallback / retry 可见性。**

## 亮点

- **治理式编排** —— 从计划起草、审核把关，到六部分发和最终尚书省汇总，形成一个完整治理闭环
- **运行时 + 本地回退** —— 优先使用 OpenCode runtime session；当 runtime 失败或返回无效结构化结果时，自动切回本地可验证路径
- **面向操作员的可观察性** —— 通过 `tang_pipeline`、`tang_audit`、`tang_doctor`、`tang_config` 暴露流程快照、审计、健康、异常、配置状态等信息
- **带重试的复审机制** —— 计划可被打回重拟，执行结果也可被复审并重新分发执行
- **稳定回归覆盖** —— 默认 deterministic regression + persisted fixture replay，适合作为当前仓库快照的发布前基线

## 仓库文档

- [贡献指南](./CONTRIBUTING.md)
- [更新日志](./CHANGELOG.md)
- [行为准则](./CODE_OF_CONDUCT.md)
- [安全策略](./SECURITY.md)
- [许可证](./LICENSE)

## 学习来源 / 致谢

> 📌 **学习来源** — 本项目在概念表达上学习了 [wanikua/boluobobo-ai-court-tutorial](https://github.com/wanikua/boluobobo-ai-court-tutorial) 中“以中国古代官制隐喻 AI 协作”的思路，并将其重新实现为一个面向 **OpenCode** 的插件：强调 `tang_process` 工作流、持久化 state、`tang_audit` / `tang_doctor` / `tang_config` 等面向 operator 的可观察性能力。
>
> 本仓库是一个**学习性改编实现**，并不是上游教程仓库的官方 fork、镜像或附属项目；这里的插件运行时、持久化状态模型，以及 audit/doctor surfaces 都属于 `oh-my-tang-dynasty` 自己的实现。

## 与 oh-my-opencode 的高层定位对比

从高层定位看，`oh-my-opencode` 和 `oh-my-tang-dynasty` 更适合被理解为**互补关系**，而不是直接竞争关系：

| | oh-my-opencode | oh-my-tang-dynasty |
|---|---|---|
| 定位 | 更宽泛的 OpenCode orchestration layer / agent harness | 一个更聚焦的 OpenCode 插件，强调 Tang governance mental model |
| 核心关注点 | multi-agent workflows、hooks、MCPs、orchestration infrastructure | 明确的 `tang_process` 治理环路 + audit / doctor / config 可见性 |
| 范围 | 面向更通用的 OpenCode workflow ecosystem | 范围更窄、更强调 review-dispatch-execution 的主题化工作流插件 |
| 更适合谁 | 想要更广 orchestration environment 的团队或用户 | 想要一个可检查、可解释的治理型插件工作流的用户 |

实际使用上，可以把 `oh-my-opencode` 理解为更大的 orchestration ecosystem，而 `oh-my-tang-dynasty` 则是把一种具体的治理模式及其 operator-facing inspection tools 打包成一个插件。

### 优势 / 取舍对比

下面这张表不是“谁更强”的结论，而是帮助你判断**哪一种更适合当前场景**：

| 维度 | oh-my-opencode 更有优势的地方 | oh-my-tang-dynasty 更有优势的地方 | 主要取舍 |
|---|---|---|---|
| 编排广度 | 更强调多模型、多 agent、并行 orchestration breadth | 更强调一个清晰可解释的 Tang 治理闭环 | 广度 vs. 聚焦 |
| 认知负担 | 适合愿意接受更复杂 orchestration mental model 的用户 | 更容易把流程理解成“起草 → 审核 → 分发 → 执行 → 审计” | 能力面更宽 vs. 心智模型更直观 |
| 可观察性风格 | 更偏向 orchestration harness / agent ecosystem 视角 | 更偏向 edict、审计、doctor、config 这些 operator-facing surfaces | 基础设施视角 vs. 治理/审计视角 |
| 适用对象 | 更适合需要复杂多智能体协作、并行调度和多 provider 组合的团队 | 更适合希望把治理环路、复审和 fallback provenance 暴露得更直观的用户 | 更强编排弹性 vs. 更强流程可解释性 |
| 成本与复杂度 | 公开定位上能力面更大，也可能涉及更高配置复杂度与 token 开销 | 范围更窄、主题更集中，通常更容易控制工作流边界 | orchestration power vs. simpler bounded workflow |

一个更实际的选择方式是：

- 如果你想要的是**更宽的 OpenCode orchestration harness**，愿意接受更高的配置复杂度与 agent/model 组合空间，那么 `oh-my-opencode` 的公开定位通常更贴近你的需求。
- 如果你想要的是**一个更聚焦、带治理语义、并且直接暴露 audit / doctor / config 的插件工作流**，那么 `oh-my-tang-dynasty` 会更顺手。

## 快速开始

安装包：

```bash
bun add oh-my-tang-dynasty
```

然后在项目的 `opencode.json` 中注册插件：

```json
{
  "plugin": ["oh-my-tang-dynasty"]
}
```

插件初始化时会自动在 `opencode.json` **同级目录**生成 `.oh-my-tang.json`（如果文件尚不存在）。如果当前 worktree 下找不到 `opencode.json`，则会回退到 worktree 根目录生成，并通过 `tang_config.warnings` 给出提示。

默认生成的 `.oh-my-tang.json` 如下：

```json
{
  "maxConcurrentMinistries": 3,
  "maxReviewRounds": 3,
  "tokenBudgetLimit": 100000,
  "healthRiskProfile": "balanced",
  "enableParallelExecution": true,
  "verbose": false,
  "agentModels": {},
  "departments": {
    "zhongshu": {
      "name": "Zhongshu",
      "chineseName": "中书省",
      "systemPrompt": "Draft a structured Tang edict plan with clear ministry tasks."
    },
    "menxia": {
      "name": "Menxia",
      "chineseName": "门下省",
      "systemPrompt": "Review Tang plans and execution results for approval, rejection, and amendments."
    },
    "shangshu": {
      "name": "Shangshu",
      "chineseName": "尚书省",
      "systemPrompt": "Dispatch approved Tang work to the correct ministries and summarize final outcomes."
    }
  },
  "ministries": [
    {
      "id": "personnel",
      "name": "Personnel",
      "chineseName": "吏部",
      "systemPrompt": "Coordinate ministry assignment and sequencing.",
      "tools": ["planning", "delegation"]
    },
    {
      "id": "revenue",
      "name": "Revenue",
      "chineseName": "户部",
      "systemPrompt": "Track token budgets and resource estimates.",
      "tools": ["budgeting", "estimation"]
    },
    {
      "id": "rites",
      "name": "Rites",
      "chineseName": "礼部",
      "systemPrompt": "Handle formatting, protocol, and style checks.",
      "tools": ["formatting", "linting"]
    },
    {
      "id": "military",
      "name": "Military",
      "chineseName": "兵部",
      "systemPrompt": "Execute implementation-focused work.",
      "tools": ["execution", "orchestration"]
    },
    {
      "id": "justice",
      "name": "Justice",
      "chineseName": "刑部",
      "systemPrompt": "Validate outputs, run checks, and enforce quality gates.",
      "tools": ["validation", "testing"]
    },
    {
      "id": "works",
      "name": "Works",
      "chineseName": "工部",
      "systemPrompt": "Perform code, build, and file-generation work.",
      "tools": ["coding", "builds"]
    }
  ]
}
```

如果你希望以库导入的方式使用，而不是作为插件加载：

```ts
import { TangDynastyOrchestrator } from "oh-my-tang-dynasty/lib";
```

当前插件支持混合执行模型：

- **OpenCode runtime 模式** —— 当插件运行在 OpenCode 中时，会使用 `input.client` 为起草、审核和六部执行创建临时会话。
- **确定性本地回退模式** —— 当 runtime 无法返回有效结构化结果，或 runtime 执行失败 / 抛错时，编排器会退回本地 Tang heuristics，保证流程仍然可用、可测、可追踪。

现在 `.oh-my-tang.json` 还支持两类结构化自定义：

- `departments`：覆盖三省名称 / 中文名 / `systemPrompt`
- `ministries`：把原本固定“六部”改成可增可减的执行角色列表

`agentModels` 可选地为 `zhongshu`、`menxia`、`shangshu` 与**当前配置中的各部 ID** 分别指定不同的 OpenCode `providerID` / `modelID`。当某个角色配置了模型覆盖时，Tang 会在对应 runtime prompt 上附加该模型；未配置的角色继续使用宿主默认模型。

治理环路还支持两条更深的控制路径：

- **门下省驳回 → 中书省重拟 → 再送审** —— 只要 review rounds 还没用尽，被驳回的方案就会结合具体评审反馈重新起草，并再次进入审核环路。
- **执行结果审计 → 重试** —— 六部任务完成后会先经过执行复审，不合格结果会在最终结案前被重新分发执行。

## 架构图

```
OpenCode Host
  opencode.json -> load "oh-my-tang-dynasty"
          │
          ▼
┌───────────────────────────────┐
│ TangDynastyPlugin             │  src/plugin.ts
│                               │
│ exposes tang_* tools          │
│ creates runtime wrapper       │
│ creates orchestrator          │
└──────────────┬────────────────┘
               │
               ▼
┌────────────────────────────────────────────────────┐
│ TangDynastyOrchestrator                           │  src/orchestrator.ts
│                                                   │
│ - persisted state: .tang-dynasty/state.json      │
│ - review rounds / retry logic                    │
│ - runtime execution + deterministic fallback     │
│ - audit / doctor / config reporting              │
└──────────────┬────────────────────────────────────┘
               │
               ▼
        tang_process(request)
               │
               ▼
      ┌──────────────────────┐
      │ 中书省 Zhongshu       │  draft plan
      └─────────┬────────────┘
                ▼
      ┌──────────────────────┐
      │ 门下省 Menxia         │  review / gate plan
      └─────────┬────────────┘
                │
                ├── reject + rounds remain
                │        └──> Zhongshu redraft -> Menxia re-review
                │
                └── approve
                         ▼
      ┌──────────────────────┐
      │ 尚书省 Shangshu       │  dispatch ministry tasks
      └─────────┬────────────┘
                ▼
      ┌───────────────────────────────────────────┐
      │ 六部 Ministries                           │
      │ personnel / revenue / rites / military   │
      │ justice / works                          │
      └─────────┬─────────────────────────────────┘
                ▼
      runtime client execution or local fallback
                ▼
      ┌──────────────────────┐
      │ 门下省 Menxia         │  execution review
      └─────────┬────────────┘
                │
                ├── reject + rounds remain
                │        └──> Shangshu re-dispatch -> retry execution
                │
                └── approve
                         ▼
      ┌──────────────────────┐
      │ 尚书省 Shangshu       │  persist final summary
      └─────────┬────────────┘
                ▼
      tang_edicts / tang_audit / tang_doctor / tang_config
```

## `tang_process` → `audit` / `doctor` 时序

```text
User
  │
  │  tang_process(request)
  ▼
OpenCode
  │
  ▼
TangDynastyPlugin
  │
  ├─ createOpenCodeTangRuntime(input.client, input.worktree)
  ├─ create TangDynastyOrchestrator(...)
  │
  ▼
TangDynastyOrchestrator.processRequest(request)
  │
  ├─ Zhongshu drafts plan
  │
  ├─ Menxia reviews plan
  │     ├─ reject -> Zhongshu redraft -> Menxia re-review
  │     └─ approve
  │
  ├─ Shangshu dispatches ministry tasks
  │
  ├─ Ministries execute
  │     ├─ runtime client path
  │     └─ local fallback path (if runtime fails / throws / returns unusable result)
  │
  ├─ Menxia reviews each execution result
  │     ├─ reject -> Shangshu re-dispatch -> retry
  │     └─ approve
  │
  ├─ Shangshu writes final summary into persisted state
  │
  └─ return final edict payload to tang_process caller

持久化后的收尾工具
  │
  ├─ tang_status   -> current phase / edict count / active tasks / budget
  ├─ tang_pipeline -> flow snapshot / current stage / recent events
  ├─ tang_edicts   -> persisted edict list and outcomes
  ├─ tang_audit    -> entries / summary / timeline / diagnostics / anomaly / hotspots / health
  └─ tang_doctor   -> health report over persisted audit state
```

## 提供的工具

| 工具 | 说明 |
|------|------|
| `tang_process` | 让请求完整经过三省六部治理环路 |
| `tang_status` | 查看当前编排阶段与预算状态 |
| `tang_pipeline` | 以 flow 视图查看当前阶段、active tasks 与最近事件 |
| `tang_agents` | 列出三省六部角色与部门信息 |
| `tang_edicts` | 查看历史 edict 及其结果 |
| `tang_audit` | 查看审计条目、汇总、时间线、诊断、异常、热点、健康信息 |
| `tang_doctor` | 对持久化 Tang 审计状态做健康检查 |
| `tang_config` | 查看 Tang 存储、运行模式与执行限制 |
| `tang_reset` | 清空持久化状态与 edict 历史 |

`tang_pipeline` 适合做发布前或运行中的快速巡检：它会用 flow-style 标记展示最新 edict 所处阶段，并附带 active task 快照和最近事件，方便 operator 快速判断流程卡在起草、复核、派发、执行还是结案。

`tang_audit` 支持通过 `edictId`、`ministry`、`latest`、`limit`、`fallbackOnly`、`includeRaw`、`rawEdictId`、`rawMinistry`、`view` 等参数做定向查询。

当查询带过滤条件时，返回的 `totalTasks`、`clientExecutions`、`localExecutions`、`fallbackExecutions` 都是相对于过滤后的结果集计算的。

如果同时提供 `latest` 和 `limit`，则以 `latest` 优先，只返回最近一条匹配的 edict。

将 `view` 设为 `summary` 时，会返回聚合汇总而不是逐条 edict 条目；设为 `timeline` 时，会返回匹配 edict 的完整持久化时间线；设为 `diagnostics` 时，会返回紧凑的执行来源/故障排查视图；设为 `anomaly` 时，只返回有问题的 edict；设为 `hotspots` 时，会聚合异常类型和 ministry 热点。`timeline` 返回的是完整持久化事件流，而不是事件级切片过滤结果。

将 `view` 设为 `health` 或直接使用 `tang_doctor`，可以对持久化状态、summary 完整性、残留 active task、异常历史以及预算健康情况做自检。当前 health / doctor 输出还会包含风险加权后的 health score、推导出的 `riskLevel`、明确的 `riskPolicy`、按优先级排序的问题发现，以及每个检查项的 meaning 说明。

使用 `tang_config` 可以直接查看当前 storage 状态、runtime mode 和 Tang 的核心执行限制，而不必翻源码。配置输出现在还包含 section meaning，并为未来的敏感配置字段预留了默认 `[REDACTED]` 的渲染策略。

`diagnostics` 视图刻意保持紧凑：它会复用 `executionSource`、`fallbackFrom`、`clientError`、`clientSessionID` 这些执行来源信息，但不会默认把 `clientRaw` 之类的原始 payload 直接抬升到 operator 主视图里。只有在显式设置 `includeRaw: true` 时，才会展开原始排障信息。

`entries` / `summary` / `timeline` / `diagnostics` 只会包含拥有最终尚书省 summary 的 edict；`anomaly` 则还可能包含从门下省复核数据中推导出的 reject 或 budget-blocked edict。

## 开发

```bash
bun install
bun run ci
```

仓库当前默认提供一层可直接运行的发布前验证基线：

- `bun run typecheck`：对当前实际存在的 TypeScript 入口文件做显式静态检查。
- `bun test`：包含 deterministic fixture-backed assertions，用来验证持久化 clean-env Tang summary / diagnostics / doctor contract。
- `bun run build`：验证打包产物可以正常生成。

当前这个公开仓库快照**不包含可直接运行的 live clean-env harness**；如果未来重新引入该路径，建议把对应测试文件与脚本一并纳入仓库后再恢复文档声明。

默认 CI 会运行：

- `bun run typecheck`
- `bun test`
- `bun run build`

## 核心概念

这个插件把中国古代的治理结构映射到 AI orchestration：

- **Edicts**：流经治理环路的结构化任务提案
- **Departments（三省）**：负责起草、审核、分发
- **Ministries（六部）**：负责专业化执行
- **门下省**：作为质量闸门，既审核计划，也复审执行结果
- **预算估算**：由户部按 ministry 维度追踪 token budget
- **状态持久化**：保存在 `.tang-dynasty/state.json` 中，支持跨会话复查
- **临时 OpenCode 会话**：当 runtime client 可用时，用于 Zhongshu 起草、Menxia 审核与 ministry 执行
- **执行审计来源**：最终会写入 edict history 和 final summary，包括 runtime 失败后的本地回退来源

## 配置

默认推荐配置（所有角色跟随使用者自己的 OpenCode 默认模型）：

```typescript
{
  maxConcurrentMinistries: 3,    // parallel ministry execution slots
  maxReviewRounds: 3,            // max 门下省 review / execution re-review iterations
  tokenBudgetLimit: 100_000,     // total token budget
  healthRiskProfile: "balanced", // health risk policy: balanced | strict | relaxed
  enableParallelExecution: true, // run ministries in parallel
  verbose: false,                // detailed logging
  departments: {
    zhongshu: { systemPrompt: "Draft a structured Tang edict plan with clear ministry tasks." },
    menxia: { systemPrompt: "Review Tang plans and execution results for approval, rejection, and amendments." },
    shangshu: { systemPrompt: "Dispatch approved Tang work to the correct ministries and summarize final outcomes." },
  },
  ministries: [
    { id: "works", name: "Works", chineseName: "工部", systemPrompt: "Perform code, build, and file-generation work.", tools: ["coding", "builds"] },
    // add or remove ministries here
  ],
  agentModels: {},
}
```

如果你想显式覆盖某些角色模型，可以使用下面这个模板：

```typescript
{
  maxConcurrentMinistries: 3,    // parallel ministry execution slots
  maxReviewRounds: 3,            // max 门下省 review / execution re-review iterations
  tokenBudgetLimit: 100_000,     // total token budget
  healthRiskProfile: "balanced", // health risk policy: balanced | strict | relaxed
  enableParallelExecution: true, // run ministries in parallel
  verbose: false,                // detailed logging
  departments: {
    zhongshu: { systemPrompt: "<CUSTOM_PROMPT>" },
    menxia: { systemPrompt: "<CUSTOM_PROMPT>" },
    shangshu: { systemPrompt: "<CUSTOM_PROMPT>" },
  },
  ministries: [
    { id: "works", name: "Works", chineseName: "工部", systemPrompt: "<CUSTOM_PROMPT>", tools: ["coding", "builds"] },
    { id: "archives", name: "Archives", chineseName: "档案部", systemPrompt: "<CUSTOM_PROMPT>", tools: ["archiving"] },
  ],
  agentModels: {                 // optional per-role OpenCode model overrides
    zhongshu: { providerID: "<YOUR_PROVIDER>", modelID: "<YOUR_MODEL>" },
    menxia: { providerID: "<YOUR_PROVIDER>", modelID: "<YOUR_MODEL>" },
    shangshu: { providerID: "<YOUR_PROVIDER>", modelID: "<YOUR_MODEL>" },
    archives: { providerID: "<YOUR_PROVIDER>", modelID: "<YOUR_MODEL>" },
  },
}
```

`agentModels` 中各字段含义如下：

| 字段 | 中文角色 | 职责 |
|---|---|---|
| `zhongshu` | 中书省 | 起草计划 / 拟定任务分解 |
| `menxia` | 门下省 | 审核计划与执行结果 |
| `shangshu` | 尚书省 | 派发任务并汇总结案 |
| `personnel` | 吏部 | 分工、调度、执行顺序协调 |
| `revenue` | 户部 | 预算、资源与 token 估算 |
| `rites` | 礼部 | 格式、规范、风格检查 |
| `military` | 兵部 | 偏执行型实现工作 |
| `justice` | 刑部 | 校验、测试、质量把关 |
| `works` | 工部 | 代码、文件生成、构建工作 |

如果你想让所有角色都跟随使用者自己的 OpenCode 默认模型，直接保留 `agentModels: {}` 即可；只有在你想对某个角色单独指定模型时，才需要填写对应字段。

当前插件配置优先级为：

1. **内置默认值**
2. **`.oh-my-tang.json`**
3. **环境变量覆盖**

目前环境变量层只显式覆盖 `healthRiskProfile`：你可以设置 `TANG_HEALTH_RISK_PROFILE` 为 `strict` 或 `relaxed`。如果该环境变量取值不合法（包括空字符串），插件会回退到当前有效配置值，并通过 `tang_config.health.warning` 与 `tang_doctor.riskPolicy.warning` 给出可见告警。

你可以随时通过 `tang_config` 查看当前生效的 runtime/configuration surface。除了已有的 `status`、`warningCount`、`warnings`、`health.source` 之外，现在还会返回 `configFile` 与 `models` 元数据，帮助 operator 直接判断：

- 实际生效的 `.oh-my-tang.json` 路径
- 当前配置文件是读取现有文件、自动生成，还是因文件损坏而回退
- 当前 worktree 下是否找到了 `opencode.json`
- 当前为哪些 Tang runtime 角色配置了独立模型覆盖

当 `.oh-my-tang.json` 缺失时，插件会自动生成；当文件 JSON 非法或字段值非法时，插件会忽略坏配置、保留可用配置，并在 `tang_config.warnings` 中给出说明。`agentModels` 目前支持三省与当前配置中的全部 ministries ID，其中 `shangshu` 的独立模型覆盖会用于 runtime-backed dispatch 阶段。

## 免责声明

本项目按“原样”提供，不承担任何直接或间接责任。

**使用前请注意：**

1. **学习与实验属性**
   - 本项目是一个受上游教程启发的学习性实现，不应被误解为上游项目的官方 fork、镜像或附属组件。

2. **AI 输出需人工复核**
   - `tang_process`、`tang_audit`、`tang_doctor` 提供的是治理流程与可观测性，不保证 AI 输出天然正确、完整或适合法务/财务/生产场景。

3. **代码与配置安全**
   - 生成代码、执行建议、工作流配置、GitHub Actions、release 步骤都应在真实使用前由人类审查。

4. **密钥与状态文件**
   - 请妥善保管 API 密钥、provider 配置和持久化 state；不要把敏感配置提交到公开仓库。

5. **致谢与引用**
   - 如果你基于本项目或相关理念继续衍生，请同时清楚标注本项目以及上游学习来源。

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。
