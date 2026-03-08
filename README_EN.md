# oh-my-tang-dynasty

[中文版](./README_CN.md) | [Default README](./README.md)

> **An experimental OpenCode plugin that tries to turn the “Three Departments and Six Ministries” idea into an AI workflow.**
>
> **Draft → Review → Dispatch → Execute → Audit**

> [!IMPORTANT]
> **Experimental First Release**
> - `oh-my-tang-dynasty` is an experimental practice inspired by the “Three Departments and Six Ministries” governance idea. The first time I saw this mental model applied to AI collaboration, it felt genuinely brilliant, which is why this repository exists.
> - The project is heavily vibe-coded: most of the code, docs, and overall structure were generated, assembled, or refined with AI, with very little traditional hand-written engineering.
> - As a result, this repository is better treated as a public experiment and reference sample than a production-ready package; **it is not guaranteed to run correctly, reproduce consistently, or fit your environment or production needs**.
> - **Right now it only explicitly supports OpenCode**. If the idea keeps evolving, it may eventually expand toward ecosystems such as `Codex`, `Claude`, `Gemini`, or `Kimi`, but there is no committed roadmap or timeline for that yet.
> - If you run into issues, spot gaps, or want to help push the idea further, please open an [Issue](https://github.com/L4ntern0/oh-my-tang/issues) or PR.

**What you will find here**

- A governance-shaped OpenCode workflow centered on `tang_process`
- Operator-facing visibility through `tang_pipeline`, `tang_audit`, `tang_doctor`, and `tang_config`
- An experimental mix of OpenCode runtime execution and local fallback behavior
- A current scope that is intentionally OpenCode-first rather than a general multi-platform agent framework

Multi-agent orchestration plugin for [OpenCode](https://github.com/opencode-ai/opencode), inspired by the Tang Dynasty's **Three Departments and Six Ministries** governance model.

> An OpenCode plugin package that turns multi-step work into a governed workflow: **Zhongshu drafts, Menxia reviews, Shangshu dispatches, and the Six Ministries execute with audit, fallback, and retry visibility**.

## Highlights

- **Governed orchestration** — plan drafting → review gate → ministry dispatch → final Shangshu summary
- **Runtime + fallback execution** — use real OpenCode runtime sessions when available and deterministic local fallback when they fail
- **Operator-facing auditability** — `tang_pipeline`, `tang_audit`, `tang_doctor`, `tang_config`, health scoring, anomaly views, and diagnostics
- **Retry-aware governance** — rejected plans can be re-drafted and rejected execution results can be re-dispatched
- **Stable regression coverage** — deterministic default tests plus persisted fixture replay, suitable as the release baseline for the current public snapshot

## Repository Docs

- [Contributing guide](./CONTRIBUTING.md)
- [Changelog](./CHANGELOG.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security policy](./SECURITY.md)
- [License](./LICENSE)

## Learning Source / Attribution

> 📌 **Learning Source** — This project learned from the idea, narrative framing, and governance metaphor in [wanikua/boluobobo-ai-court-tutorial](https://github.com/wanikua/boluobobo-ai-court-tutorial), which models AI collaboration through Chinese imperial institutions.
>
> This repository re-implements those ideas as an **OpenCode plugin** with its own runtime wrapper, persisted state model, and operator-facing `tang_process`, `tang_audit`, `tang_doctor`, and `tang_config` surfaces. It is **not** an official fork, mirror, or affiliated upstream component.
>
> If you create derivative works or projects inspired by this repository's governance model, please preserve clear attribution to both this repository and the upstream learning source.

## High-level Comparison with oh-my-opencode

At a high level, `oh-my-opencode` and `oh-my-tang-dynasty` are better understood as **complementary**, not competing, layers:

| | oh-my-opencode | oh-my-tang-dynasty |
|---|---|---|
| Positioning | A broad OpenCode orchestration layer / agent harness | A focused OpenCode plugin with a Tang-governance mental model |
| Primary focus | Multi-agent workflows, hooks, MCPs, orchestration infrastructure | One explicit `tang_process` governance loop plus audit / doctor / config visibility |
| Scope | General-purpose ecosystem for OpenCode workflows | Narrower workflow plugin with a themed review-dispatch-execution model |
| Best fit | Teams or users who want a broader orchestration environment | Users who want a concrete, inspectable governance pipeline inside OpenCode |

In practice, `oh-my-opencode` is the wider orchestration ecosystem, while `oh-my-tang-dynasty` packages one specific governance pattern and its operator-facing inspection tools.

### Strengths / Trade-offs

This is not a “winner vs. loser” comparison. It is a quick way to judge which layer better matches your current workflow.

| Dimension | Where oh-my-opencode is generally stronger | Where oh-my-tang-dynasty is generally stronger | Main trade-off |
|---|---|---|---|
| Orchestration breadth | Broader multi-model, multi-agent, parallel orchestration story | A more tightly scoped Tang governance loop | Breadth vs. focus |
| Cognitive load | Better for users willing to operate a larger orchestration mental model | Easier to reason about as draft → review → dispatch → execution → audit | Wider power surface vs. simpler mental model |
| Observability style | Leans toward an orchestration harness / agent ecosystem view | Leans toward explicit edict, audit, doctor, and config operator surfaces | Infrastructure view vs. governance/audit view |
| Best-fit users | Teams needing broader multi-agent coordination and provider combinations | Users who want a more inspectable governance workflow with visible retries and fallback provenance | Flexibility vs. explainability |
| Cost / complexity | Public positioning suggests broader capability and may involve more config and token overhead | Narrower scope usually means easier workflow boundary control | More orchestration power vs. a more bounded workflow |

A practical way to choose is:

- Choose **oh-my-opencode** if you want a broader OpenCode orchestration harness and you are comfortable with the extra complexity that comes with wider multi-agent and multi-model composition.
- Choose **oh-my-tang-dynasty** if you want a narrower, governance-shaped plugin workflow with more explicit audit / doctor / config visibility.

## Quick Start

Install the package:

```bash
bun add oh-my-tang-dynasty
```

Register it in your project `opencode.json`:

```json
{
  "plugin": ["oh-my-tang-dynasty"]
}
```

On initialization, the plugin auto-generates `.oh-my-tang.json` next to `opencode.json` when the file is missing. If no `opencode.json` can be found under the current worktree, it falls back to generating the file at the worktree root and surfaces a warning through `tang_config.warnings`.

The generated `.oh-my-tang.json` looks like this:

```json
{
  "maxConcurrentMinistries": 3,
  "maxReviewRounds": 3,
  "tokenBudgetLimit": 100000,
  "healthRiskProfile": "balanced",
  "enableParallelExecution": true,
  "verbose": false
}
```

If you want library imports instead of plugin loading:

```ts
import { TangDynastyOrchestrator } from "oh-my-tang-dynasty/lib";
```

The plugin supports a hybrid execution model:

- **OpenCode runtime mode** — when loaded inside OpenCode, it uses `input.client` to create ephemeral sessions for planning, review, and ministry execution
- **Deterministic fallback mode** — if the runtime client cannot return valid structured output, or if a runtime ministry execution fails or throws, the orchestrator falls back to local Tang heuristics so the pipeline remains usable and testable

The governance loop also supports two deeper control paths:

- **Menxia rejection → Zhongshu redraft → resubmission** — when review rounds remain, rejected plans are re-drafted against concrete review feedback and re-enter the review loop instead of stopping at a placeholder revision note
- **Execution audit → retry** — completed ministry results are audited before acceptance, and unsatisfactory results can be re-dispatched for another execution attempt before the edict reaches its final outcome

## Architecture

```text
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
      │ Zhongshu             │  draft plan
      └─────────┬────────────┘
                ▼
      ┌──────────────────────┐
      │ Menxia               │  review / gate plan
      └─────────┬────────────┘
                │
                ├── reject + rounds remain
                │        └──> Zhongshu redraft -> Menxia re-review
                │
                └── approve
                         ▼
      ┌──────────────────────┐
      │ Shangshu             │  dispatch ministry tasks
      └─────────┬────────────┘
                ▼
      ┌───────────────────────────────────────────┐
      │ Six Ministries                            │
      │ personnel / revenue / rites / military   │
      │ justice / works                          │
      └─────────┬─────────────────────────────────┘
                ▼
      runtime client execution or local fallback
                ▼
      ┌──────────────────────┐
      │ Menxia               │  execution review
      └─────────┬────────────┘
                │
                ├── reject + rounds remain
                │        └──> Shangshu re-dispatch -> retry execution
                │
                └── approve
                         ▼
      ┌──────────────────────┐
      │ Shangshu             │  persist final summary
      └─────────┬────────────┘
                ▼
      tang_edicts / tang_audit / tang_doctor / tang_config
```

## Sequence: `tang_process` → `audit` / `doctor`

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

Persisted follow-up tools
  │
  ├─ tang_status   -> current phase / edict count / active tasks / budget
  ├─ tang_pipeline -> flow snapshot / current stage / recent events
  ├─ tang_edicts   -> persisted edict list and outcomes
  ├─ tang_audit    -> entries / summary / timeline / diagnostics / anomaly / hotspots / health
  └─ tang_doctor   -> health report over persisted audit state
```

## Tools Provided

| Tool | Description |
|------|-------------|
| `tang_process` | Route a request through the full Tang governance pipeline |
| `tang_status` | Check current orchestration phase and budget |
| `tang_pipeline` | Inspect a flow-style snapshot with the current stage, active tasks, and recent events |
| `tang_agents` | List all departments and ministries |
| `tang_edicts` | Review persisted edicts and outcomes |
| `tang_audit` | Inspect audit entries, summaries, timelines, diagnostics, anomalies, hotspots, and health |
| `tang_doctor` | Run a self-check on persisted Tang audit state |
| `tang_config` | Inspect Tang storage, runtime mode, and execution limits |
| `tang_reset` | Clear persisted orchestration state and edict history |

Use `tang_pipeline` for a fast operator check before release or during a live run: it renders the newest edict as a flow-style stage snapshot and includes active task context plus recent events so you can quickly see whether Tang is stuck in drafting, review, dispatch, execution, or completion.

`tang_audit` supports focused queries with optional `edictId`, `ministry`, `latest`, `limit`, `fallbackOnly`, `includeRaw`, `rawEdictId`, `rawMinistry`, and `view` arguments.

When filters are applied, the returned `totalTasks`, `clientExecutions`, `localExecutions`, and `fallbackExecutions` values are relative to the filtered result set.

If both `latest` and `limit` are provided, `latest` takes precedence and returns only the most recent matching edict.

Set `view` to `summary` to return aggregate counts instead of per-edict entries, `timeline` to return persisted chronological events for matching edicts, `diagnostics` to return a compact provenance troubleshooting view, `anomaly` to return only problematic edicts with compact reason labels, or `hotspots` to aggregate anomaly types and ministry hotspots.

Set `view` to `health` or use `tang_doctor` to run a self-check over persisted state, summary integrity, active-task residue, anomaly history, and budget health.

Use `tang_config` to inspect current storage status, runtime mode, and core Tang execution limits without digging through plugin source.

## Development

```bash
bun install
bun run ci
```

The repository currently ships one directly runnable release baseline:

- `bun run typecheck` performs an explicit static check against the TypeScript entry files that actually exist in this snapshot
- `bun test` covers the deterministic fixture-backed assertions for the persisted clean-env Tang summary / diagnostics / doctor contract
- `bun run build` verifies that the published bundle can be generated successfully

This public repository snapshot does **not** currently include a runnable live clean-env harness. If that path is reintroduced later, the matching test file and script should be restored together with the docs.

The default CI path runs:

- `bun run typecheck`
- `bun test`
- `bun run build`

## Concepts

The plugin maps Tang Dynasty governance into AI orchestration:

- **Edicts** are structured task proposals that flow through the review pipeline
- **Departments** handle planning, review, and dispatch
- **Ministries** are specialized execution agents
- The **Chancellery** (Menxia) acts as a quality gate with configurable review rounds for both plan approval and execution-result re-review
- **Estimated token budgets** are tracked per ministry by the Ministry of Revenue
- **State** is persisted under `.tang-dynasty/state.json` so edicts can be reviewed across sessions
- **Ephemeral OpenCode sessions** are used for Zhongshu drafting, Menxia review, and ministry execution when the runtime client is available
- **Execution audit provenance** is persisted in edict history and final summaries, including local fallback after runtime failure when applicable

## Configuration

```ts
{
  maxConcurrentMinistries: 3,
  maxReviewRounds: 3,
  tokenBudgetLimit: 100_000,
  healthRiskProfile: "balanced",
  enableParallelExecution: true,
  verbose: false,
}
```

You can inspect the effective runtime/configuration surface at any time with `tang_config`.

The plugin resolves configuration in this order:

1. built-in defaults
2. `.oh-my-tang.json`
3. environment overrides

Right now the environment layer explicitly overrides only `healthRiskProfile`: set `TANG_HEALTH_RISK_PROFILE` to `strict` or `relaxed` when needed. If the env var is invalid, including an empty string, the plugin falls back to the currently effective profile and surfaces a warning through `tang_config.health.warning` and `tang_doctor.riskPolicy.warning`.

In addition to `status`, `warningCount`, `warnings`, and `health.source`, `tang_config` now reports `configFile` metadata so operators can see:

- which `.oh-my-tang.json` path is active
- whether the file was auto-generated, read from disk, or bypassed after an invalid-file fallback
- whether `opencode.json` was successfully discovered in the current worktree

If `.oh-my-tang.json` is missing, Tang creates it automatically. If the file contains invalid JSON or invalid field values, Tang ignores the bad values, keeps usable settings, and reports the issue through `tang_config.warnings`.

## Disclaimer

This project is provided "as is" without warranties of any kind.

**Please note:**

1. **Learning and experimentation**
   - This project is a learning adaptation inspired by an upstream tutorial repo and should not be presented as an official fork, mirror, or affiliated component.

2. **Human review is still required**
   - `tang_process`, `tang_audit`, and `tang_doctor` provide governance flow and observability, but they do not guarantee correctness, completeness, legal compliance, or production safety.

3. **Code and configuration safety**
   - Review generated code, workflow files, release steps, and operational guidance before using them in real environments.

4. **Secrets and persisted state**
   - Keep API keys, provider configuration, and persisted state safe; never commit sensitive configuration to a public repository.

5. **Attribution**
   - If you build derivative work from this project or its ideas, preserve clear attribution to both this repository and the upstream learning source.

## License

This project is licensed under the [MIT License](./LICENSE).
