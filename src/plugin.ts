import { join } from "node:path";
import type { Plugin } from "@opencode-ai/plugin";
import { tool } from "@opencode-ai/plugin";
import { resolveTangConfig } from "./config.js";
import { TangDynastyOrchestrator } from "./orchestrator.js";
import { createOpenCodeTangRuntime } from "./runtime.js";
import type { HealthRiskProfile, HealthRiskProfileSource } from "./types.js";

const HEALTH_RISK_PROFILES = ["balanced", "strict", "relaxed"] as const satisfies readonly HealthRiskProfile[];

type HealthRiskProfileResolution = {
  profile: HealthRiskProfile;
  source: HealthRiskProfileSource;
  warning?: string;
};

function isHealthRiskProfile(value: string): value is HealthRiskProfile {
  return HEALTH_RISK_PROFILES.some((profile) => profile === value);
}

function resolveHealthRiskProfileFromEnv(
  fallback: Pick<HealthRiskProfileResolution, "profile" | "source">,
): HealthRiskProfileResolution {
  const configured = process.env.TANG_HEALTH_RISK_PROFILE;

  if (configured === undefined) {
    return fallback;
  }

  if (isHealthRiskProfile(configured)) {
    return { profile: configured, source: "env" };
  }

  return {
    profile: fallback.profile,
    source: "env-invalid-fallback",
    warning: `Invalid TANG_HEALTH_RISK_PROFILE="${configured}"; falling back to "${fallback.profile}". Supported values: ${HEALTH_RISK_PROFILES.join(", ")}.`,
  };
}

const TangDynastyPlugin: Plugin = async (input) => {
  const resolvedConfig = resolveTangConfig(input.worktree);
  const runtime = createOpenCodeTangRuntime(
    input.client,
    input.worktree,
    resolvedConfig.config.departments,
    resolvedConfig.config.ministries,
    resolvedConfig.config.agentModels,
  );
  const resolvedHealthRiskProfile = resolveHealthRiskProfileFromEnv({
    profile: resolvedConfig.config.healthRiskProfile ?? "balanced",
    source: resolvedConfig.config.healthRiskProfileSource ?? "default",
  });
  const orchestrator = new TangDynastyOrchestrator({
    storagePath: join(input.worktree, ".tang-dynasty", "state.json"),
    maxConcurrentMinistries: resolvedConfig.config.maxConcurrentMinistries,
    maxReviewRounds: resolvedConfig.config.maxReviewRounds,
    tokenBudgetLimit: resolvedConfig.config.tokenBudgetLimit,
    healthRiskProfile: resolvedHealthRiskProfile.profile,
    healthRiskProfileSource: resolvedHealthRiskProfile.source,
    healthRiskProfileWarning: resolvedHealthRiskProfile.warning,
    enableParallelExecution: resolvedConfig.config.enableParallelExecution,
    verbose: resolvedConfig.config.verbose,
    departments: resolvedConfig.config.departments,
    ministries: resolvedConfig.config.ministries,
    agentModels: resolvedConfig.config.agentModels ?? {},
    configWarnings: resolvedConfig.warnings,
    configFile: resolvedConfig.configFile,
  }, undefined, runtime);

  return {
    tool: {
      tang_process: tool({
        description:
          "Process a request through the 三省六部 (Three Departments & configurable Ministries) pipeline. " +
          "Drafts a plan with 中书省, reviews it with 门下省, dispatches via 尚书省, " +
          "and executes through specialized ministries.",
        args: {
          request: tool.schema
            .string()
            .describe("The user request to route through the Tang Dynasty governance pipeline"),
        },
        async execute({ request }) {
          const edict = await orchestrator.processRequest(request);
          return JSON.stringify(edict, null, 2);
        },
      }),

      tang_status: tool({
        description: "Get current orchestration phase, persisted edict count, active tasks, and token budget.",
        args: {},
        async execute() {
          const state = orchestrator.getState();
          return JSON.stringify(
            {
              phase: state.phase,
              edictCount: state.edicts.size,
              activeTaskCount: state.activeTasks.size,
              budget: orchestrator.getBudget(),
            },
            null,
            2,
          );
        },
      }),

      tang_pipeline: tool({
        description: "Show a flow-style Tang pipeline snapshot with the current stage, active tasks, and recent events.",
        args: {},
        async execute() {
          return JSON.stringify(orchestrator.getPipelineReport(), null, 2);
        },
      }),

      tang_agents: tool({
        description: "List all available agents in the 三省六部 system — the Three Departments and the currently configured ministries.",
        args: {},
        async execute() {
          return JSON.stringify(
            {
              departments: Object.values(resolvedConfig.config.departments ?? {}).map((department) => ({
                id: department.id,
                name: department.name,
                chineseName: department.chineseName,
                systemPrompt: department.systemPrompt,
              })),
              ministries: Object.values(resolvedConfig.config.ministries ?? {}).map((ministry) => ({
                id: ministry.id,
                name: ministry.name,
                chineseName: ministry.chineseName,
                systemPrompt: ministry.systemPrompt,
                tools: ministry.tools,
              })),
            },
            null,
            2,
          );
        },
      }),

      tang_edicts: tool({
        description: "List persisted edicts (past and present) processed by the Tang Dynasty orchestration system.",
        args: {},
        async execute() {
          return JSON.stringify(orchestrator.getEdicts(), null, 2);
        },
      }),

      tang_audit: tool({
        description: "Show a concise audit trail for persisted edicts, including client execution, local execution, and fallback counts.",
        args: {
          edictId: tool.schema.string().optional().describe("Filter to one persisted edict ID"),
          ministry: tool.schema.string().optional().describe("Filter audit entries to a single ministry"),
          latest: tool.schema.boolean().optional().describe("Return only the most recent matching edict"),
          limit: tool.schema.number().int().positive().optional().describe("Maximum number of audit entries to return"),
          fallbackOnly: tool.schema.boolean().optional().describe("Return only audit entries that used local fallback after a client execution failure"),
          includeRaw: tool.schema.boolean().optional().describe("When view is diagnostics, include raw client payloads for explicit drill-down. Default diagnostics output stays compact."),
          rawEdictId: tool.schema.string().optional().describe("When view is diagnostics and includeRaw is true, only expand raw payloads for this edict while keeping the broader result set compact."),
          rawMinistry: tool.schema.string().optional().describe("When view is diagnostics and includeRaw is true, only expand raw payloads for this ministry while keeping other ministries compact."),
          view: tool.schema.enum(["entries", "summary", "timeline", "diagnostics", "anomaly", "hotspots", "health"]).optional().describe("Return filtered audit entries, an aggregate summary view, a per-edict event timeline, a compact provenance diagnostics view, anomaly-focused edict summaries, anomaly hotspots, or a self-check health report"),
        },
        async execute({ edictId, ministry, latest, limit, fallbackOnly, includeRaw, rawEdictId, rawMinistry, view }) {
          const query = { edictId, ministry, latest, limit, fallbackOnly, includeRaw, rawEdictId, rawMinistry, view };
          return JSON.stringify(
            view === "summary"
              ? orchestrator.getAuditSummary(query)
              : view === "health"
                ? orchestrator.getAuditHealth()
              : view === "diagnostics"
                ? orchestrator.getAuditDiagnostics(query)
              : view === "hotspots"
                ? orchestrator.getAuditAnomalyHotspots(query)
              : view === "anomaly"
                ? orchestrator.getAuditAnomalies(query)
              : view === "timeline"
                ? orchestrator.getAuditTimeline(query)
                : orchestrator.getAuditTrail(query),
            null,
            2,
          );
        },
      }),

      tang_doctor: tool({
        description: "Run a self-check on persisted Tang audit state and report a risk-weighted health score, derived risk level, explainable risk policy, and operator-priority anomaly-aware findings with explicit priority and weight.",
        args: {},
        async execute() {
          return JSON.stringify(orchestrator.getAuditHealth(), null, 2);
        },
      }),

      tang_config: tool({
        description: "Inspect current Tang plugin configuration, storage status, and runtime mode. Future secret-like config values are redacted by default.",
        args: {},
        async execute() {
          return JSON.stringify(orchestrator.getConfigReport(), null, 2);
        },
      }),

      tang_reset: tool({
        description: "Clear persisted Tang Dynasty state, including historical edicts and active tasks.",
        args: {},
        async execute() {
          orchestrator.resetState();
          return JSON.stringify({ ok: true, message: "Tang Dynasty state reset." }, null, 2);
        },
      }),
    },

    "experimental.chat.system.transform": async (_hookInput, output) => {
      output.system.push(
        "You have access to the 三省六部 (Tang Dynasty Multi-Agent Orchestration) system.",
        "Use tang_process for complex, multi-step work that benefits from draft-review-dispatch execution.",
        "Use tang_status to inspect orchestration phase, budget, and active work.",
        "Use tang_pipeline for a flow-style snapshot of the current Tang stage, active tasks, and recent events.",
        "Use tang_agents to inspect the Three Departments and the currently configured ministries.",
        "Use tang_edicts to review persisted edicts and execution outcomes.",
        "Use tang_audit to inspect concise execution provenance and fallback history across persisted edicts; set view to diagnostics for a compact troubleshooting summary.",
        "Use tang_doctor to run a self-check on persisted Tang audit state, including a risk-weighted health score, a derived risk level, an explainable risk policy, and operator-priority anomaly-aware findings with explicit priority and weight.",
        "Use tang_config to inspect storage status, runtime mode, and Tang execution limits; future secret-like values are redacted by default.",
        "Use tang_reset only when you intentionally want to clear persisted Tang Dynasty state.",
      );
    },

    "tool.definition": async (toolInput, output) => {
      if (toolInput.toolID.startsWith("tang_")) {
        output.description = `[三省六部] ${output.description}`;
      }
    },
  };
};

export default TangDynastyPlugin;
