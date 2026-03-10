import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { DEPARTMENTS } from "./agents/departments.js";
import { MINISTRIES } from "./agents/ministries.js";
import { TANG_DEFAULT_PLUGIN_CONFIG } from "./config.js";
import type { TangExecutionRuntime } from "./runtime.js";
import type {
  AgentMessage,
  AuditHealthCheck,
  AuditHealthCheckId,
  AuditHealthFinding,
  AuditHealthFindingPriority,
  AuditHealthRiskPolicy,
  AuditHealthReport,
  AuditHealthRiskLevel,
  HealthRiskProfile,
  AuditAnomalyHotspots,
  AuditAnomalyReasonCount,
  AuditAnomalyReason,
  EdictAuditDiagnostics,
  AuditTimelineEvent,
  AuditTrailSummary,
  AuditTrailQuery,
  DepartmentId,
  Edict,
  EdictAuditAnomaly,
  EdictAuditTrailEntry,
  EdictAuditTimeline,
  MinistryId,
  MinistryAuditDiagnosticsEntry,
  AuditAnomalyMinistryHotspot,
  MinistryAuditSummaryEntry,
  MinistryAuditTrailEntry,
  MinistryTask,
  OrchestrationPhase,
  OrchestrationState,
  PipelineStagePhase,
  PipelineStageSnapshot,
  PipelineStageStatus,
  PersistedOrchestrationState,
  PluginConfig,
  StorageLoadStatus,
  TangPipelineReport,
  TangConfigReport,
  TokenBudget,
} from "./types.js";

const DEFAULT_CONFIG: PluginConfig = {
  ...TANG_DEFAULT_PLUGIN_CONFIG,
  healthRiskProfileSource: "default",
};

let edictCounter = 0;
let taskCounter = 0;

function generateEdictId(): string {
  return `edict-${++edictCounter}-${Date.now().toString(36)}`;
}

function generateTaskId(): string {
  return `task-${++taskCounter}-${Date.now().toString(36)}`;
}

function includesAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(needle));
}

function getEdictSequence(id: string): number {
  const match = /^edict-(\d+)-/.exec(id);
  return match ? Number(match[1]) : 0;
}

function compareEdictsNewestFirst(left: Edict, right: Edict): number {
  const byCreatedAt = right.createdAt - left.createdAt;
  if (byCreatedAt !== 0) {
    return byCreatedAt;
  }

  return getEdictSequence(right.id) - getEdictSequence(left.id);
}

const PIPELINE_STAGES: readonly {
  phase: PipelineStagePhase;
  label: string;
  chineseLabel: string;
}[] = [
  { phase: "drafting", label: "Drafting", chineseLabel: "中书省起草" },
  { phase: "reviewing", label: "Reviewing", chineseLabel: "门下省复核" },
  { phase: "dispatching", label: "Dispatching", chineseLabel: "尚书省派发" },
  { phase: "executing", label: "Executing", chineseLabel: "六部执行" },
  { phase: "completing", label: "Completing", chineseLabel: "结案归档" },
] as const;

const PIPELINE_STAGE_MARKERS: Record<PipelineStageStatus, string> = {
  pending: "[ ]",
  active: "[>]",
  completed: "[x]",
  failed: "[!]",
};

const CONFIG_STORAGE_MEANING = "Shows whether persisted Tang state is available and where it lives.";
const CONFIG_RUNTIME_MEANING = "Shows whether Tang is using only local heuristics or OpenCode client sessions with fallback.";
const CONFIG_LIMITS_MEANING = "Shows the concurrency, review, and budget limits that shape Tang orchestration behavior.";
const CONFIG_HEALTH_MEANING = "Shows which named health risk profile shapes doctor scores and risk levels.";
const CONFIG_EXECUTION_MEANING = "Shows execution-mode flags that affect how work runs and how much detail Tang emits.";
const CONFIG_MODELS_MEANING = "Shows per-role OpenCode model overrides for Tang runtime agents; roles not listed use the host default model.";
const CONFIG_REDACTION_PLACEHOLDER = "[REDACTED]";
const CONFIG_SENSITIVE_KEYWORDS = ["password", "secret", "token", "key", "credential", "auth", "bearer", "private"];
const CONFIG_NON_SENSITIVE_KEYS = new Set(["authMode", "tokenBudgetLimit"]);
const CONFIG_VISIBLE_WITHIN_SENSITIVE_CONTEXT_KEYS = new Set(["authMode", "enabled", "label", "name", "provider", "type"]);
const HEALTH_FINDING_WEIGHT: Record<AuditHealthCheckId, number> = {
  storage: 6,
  anomalies: 5,
  summary_integrity: 4,
  active_tasks: 3,
  budget: 2,
  history: 1,
};

const HEALTH_FINDING_PRIORITY_RANK: Record<AuditHealthFindingPriority, number> = {
  critical: 3,
  high: 2,
  medium: 1,
  low: 0,
};

const HEALTH_RISK_PROFILES: Record<HealthRiskProfile, {
  priorityMultipliers: Record<AuditHealthFindingPriority, number>;
  riskLevelThresholds: Record<AuditHealthRiskLevel, number>;
}> = {
  balanced: {
    priorityMultipliers: {
      critical: 12,
      high: 5,
      medium: 4,
      low: 2,
    },
    riskLevelThresholds: {
      low: 90,
      medium: 70,
      high: 40,
      critical: 0,
    },
  },
  strict: {
    priorityMultipliers: {
      critical: 14,
      high: 6,
      medium: 5,
      low: 3,
    },
    riskLevelThresholds: {
      low: 95,
      medium: 80,
      high: 60,
      critical: 0,
    },
  },
  relaxed: {
    priorityMultipliers: {
      critical: 10,
      high: 4,
      medium: 3,
      low: 1,
    },
    riskLevelThresholds: {
      low: 85,
      medium: 60,
      high: 30,
      critical: 0,
    },
  },
};

const HEALTH_SCORE_MODEL = "max(0, 100 - Σ(weight × priorityMultiplier))" as const;

export class TangDynastyOrchestrator {
  private state: OrchestrationState;
  private config: PluginConfig;
  private storagePath?: string;
  private storageStatus: StorageLoadStatus;
  private storageError?: string;
  private onMessage?: (msg: AgentMessage) => void;
  private runtime?: TangExecutionRuntime;

  constructor(
    config: Partial<PluginConfig> & { storagePath?: string } = {},
    onMessage?: (msg: AgentMessage) => void,
    runtime?: TangExecutionRuntime,
  ) {
    const { storagePath, ...pluginConfig } = config;
    const hasExplicitHealthRiskProfile = Object.prototype.hasOwnProperty.call(pluginConfig, "healthRiskProfile");
    const derivedHealthRiskProfileSource: PluginConfig["healthRiskProfileSource"] =
      pluginConfig.healthRiskProfileSource
      ?? (hasExplicitHealthRiskProfile ? "config" : DEFAULT_CONFIG.healthRiskProfileSource);
    this.config = {
      ...DEFAULT_CONFIG,
      ...pluginConfig,
      healthRiskProfileSource: derivedHealthRiskProfileSource,
    };
    this.storagePath = storagePath;
    this.storageStatus = storagePath ? "missing" : "not_configured";
    this.onMessage = onMessage;
    this.runtime = runtime;
    this.state = this.loadState() ?? {
      edicts: new Map(),
      activeTasks: new Map(),
      tokenBudget: this.createBudget(),
      phase: "idle",
    };
  }

  private createBudget(): TokenBudget {
    const perMinistry: Record<MinistryId, number> = {
      personnel: 0,
      revenue: 0,
      rites: 0,
      military: 0,
      justice: 0,
      works: 0,
    };
    return { total: this.config.tokenBudgetLimit, used: 0, perMinistry };
  }

  private estimateTaskCost(description: string): number {
    const normalizedLength = description.trim().length;
    return Math.max(64, Math.min(2048, 64 + normalizedLength * 4));
  }

  private recordBudgetUsage(ministry: MinistryId, description: string) {
    const requested = this.estimateTaskCost(description);
    const remaining = Math.max(0, this.state.tokenBudget.total - this.state.tokenBudget.used);
    const charged = Math.min(requested, remaining);

    this.state.tokenBudget.used += charged;
    this.state.tokenBudget.perMinistry[ministry] += charged;
    this.persistState();
  }

  private appendUniqueTask(
    tasks: Array<{ ministry: MinistryId; description: string }>,
    task: { ministry: MinistryId; description: string },
  ) {
    if (!tasks.some((existing) => existing.ministry === task.ministry)) {
      tasks.push(task);
    }
  }

  private emit(role: DepartmentId | MinistryId, content: string, metadata?: Record<string, unknown>) {
    const msg: AgentMessage = { role, content, metadata, timestamp: Date.now() };
    this.onMessage?.(msg);
    return msg;
  }

  private recordEdictMessage(edict: Edict, message: AgentMessage) {
    edict.messages.push(message);
    edict.updatedAt = Date.now();
    this.persistState();
  }

  private emitForEdict(
    edict: Edict,
    role: DepartmentId | MinistryId,
    content: string,
    metadata?: Record<string, unknown>,
  ) {
    const message = this.emit(role, content, metadata);
    this.recordEdictMessage(edict, message);
    return message;
  }

  private setPhase(phase: OrchestrationPhase) {
    this.state.phase = phase;
    this.persistState();
  }

  private loadState(): OrchestrationState | undefined {
    if (!this.storagePath) {
      this.storageStatus = "not_configured";
      this.storageError = undefined;
      return undefined;
    }

    if (!existsSync(this.storagePath)) {
      this.storageStatus = "missing";
      this.storageError = undefined;
      return undefined;
    }

    try {
      const parsed = JSON.parse(readFileSync(this.storagePath, "utf8")) as PersistedOrchestrationState;
      this.storageStatus = "loaded";
      this.storageError = undefined;
      return {
        edicts: new Map(parsed.edicts.map((edict) => [edict.id, edict])),
        activeTasks: new Map(parsed.activeTasks.map((task) => [task.id, task])),
        tokenBudget: parsed.tokenBudget,
        phase: parsed.phase,
      };
    } catch (error) {
      this.storageStatus = "corrupt";
      this.storageError = error instanceof Error ? error.message : String(error);
      return undefined;
    }
  }

  private persistState() {
    if (!this.storagePath) {
      return;
    }

    const snapshot: PersistedOrchestrationState = {
      edicts: Array.from(this.state.edicts.values()),
      activeTasks: Array.from(this.state.activeTasks.values()),
      tokenBudget: this.state.tokenBudget,
      phase: this.state.phase,
    };

    mkdirSync(dirname(this.storagePath), { recursive: true });
    writeFileSync(this.storagePath, JSON.stringify(snapshot, null, 2));
    this.storageStatus = "loaded";
    this.storageError = undefined;
  }

  private buildStorageHealthCheck(): AuditHealthCheck {
    switch (this.storageStatus) {
      case "loaded":
        return {
          id: "storage",
          status: "ok",
          detail: `Using persisted state at ${this.storagePath}`,
          meaning: "Shows whether Tang can read and trust the persisted state on disk.",
        };
      case "missing":
        return {
          id: "storage",
          status: "warn",
          detail: `Configured persisted state file does not exist at ${this.storagePath}`,
          meaning: "Shows whether Tang can read and trust the persisted state on disk.",
          recommendation: "Run tang_process to create the persisted state file or verify storagePath before trusting audit views.",
        };
      case "corrupt":
        return {
          id: "storage",
          status: "error",
          detail: `Configured persisted state file is corrupt or unreadable at ${this.storagePath}`,
          meaning: "Shows whether Tang can read and trust the persisted state on disk.",
          recommendation: `Repair the persisted state file manually or run tang_reset to recreate it. ${this.storageError ?? ""}`.trim(),
        };
      case "not_configured":
      default:
        return {
          id: "storage",
          status: "ok",
          detail: "Persistence path is not configured; persisted audit views are disabled.",
          meaning: "Shows whether Tang can read and trust the persisted state on disk.",
        };
    }
  }

  private isSensitiveConfigKey(key: string): boolean {
    if (CONFIG_NON_SENSITIVE_KEYS.has(key)) {
      return false;
    }

    const lowerKey = key.toLowerCase();
    return CONFIG_SENSITIVE_KEYWORDS.some((keyword) => lowerKey.includes(keyword));
  }

  private isVisibleWithinSensitiveContext(key?: string): boolean {
    return key ? CONFIG_VISIBLE_WITHIN_SENSITIVE_CONTEXT_KEYS.has(key) : false;
  }

  private sanitizeConfigForDisplay(value: unknown, key?: string, inheritedSensitive = false): unknown {
    const sensitiveContext = inheritedSensitive || (key ? this.isSensitiveConfigKey(key) : false);

    if (Array.isArray(value)) {
      return value.map((item) => this.sanitizeConfigForDisplay(item, key, sensitiveContext));
    }

    if (typeof value === "string" && (sensitiveContext && !this.isVisibleWithinSensitiveContext(key))) {
      return CONFIG_REDACTION_PLACEHOLDER;
    }

    if (typeof value === "object" && value !== null) {
      return Object.fromEntries(
        Object.entries(value).map(([entryKey, entryValue]) => [
          entryKey,
          this.sanitizeConfigForDisplay(entryValue, entryKey, sensitiveContext),
        ]),
      );
    }

    return value;
  }

  private shouldIncludeDiagnosticsRaw(
    edictId: string,
    ministry: MinistryId,
    clientRaw: string | undefined,
    query: AuditTrailQuery,
  ): boolean {
    if (!query.includeRaw || !clientRaw) {
      return false;
    }

    if (query.rawEdictId && edictId !== query.rawEdictId) {
      return false;
    }

    if (query.rawMinistry && ministry !== query.rawMinistry) {
      return false;
    }

    return true;
  }

  private compareDiagnosticsEdicts(left: Edict, right: Edict, query: AuditTrailQuery): number {
    if (query.includeRaw && query.rawEdictId) {
      const rawEdictId = query.rawEdictId;
      const leftPriority = left.id === rawEdictId ? 1 : 0;
      const rightPriority = right.id === rawEdictId ? 1 : 0;

      if (leftPriority !== rightPriority) {
        return rightPriority - leftPriority;
      }
    }

    return compareEdictsNewestFirst(left, right);
  }

  getConfigReport(): TangConfigReport {
    const warnings = [
      ...(this.config.configWarnings ?? []),
      ...(this.config.healthRiskProfileWarning ? [this.config.healthRiskProfileWarning] : []),
    ];
    const status: TangConfigReport["status"] = warnings.length > 0 ? "warn" : "ok";

    return this.sanitizeConfigForDisplay({
      summary: "Tang config explains where state lives, how runtime execution works, and which limits shape orchestration behavior.",
      status,
      warningCount: warnings.length,
      warnings,
      ...(this.config.configFile
        ? {
            configFile: this.config.configFile,
          }
        : {}),
      storage: {
        path: this.storagePath,
        status: this.storageStatus,
        meaning: CONFIG_STORAGE_MEANING,
      },
      runtime: {
        mode: this.runtime ? "client-with-local-fallback" : "local-only",
        meaning: CONFIG_RUNTIME_MEANING,
      },
      limits: {
        maxConcurrentMinistries: this.config.maxConcurrentMinistries,
        maxReviewRounds: this.config.maxReviewRounds,
        tokenBudgetLimit: this.config.tokenBudgetLimit,
        meaning: CONFIG_LIMITS_MEANING,
      },
      health: {
        riskProfile: this.config.healthRiskProfile,
        source: this.config.healthRiskProfileSource,
        ...(this.config.healthRiskProfileWarning
          ? { warning: this.config.healthRiskProfileWarning }
          : {}),
        meaning: CONFIG_HEALTH_MEANING,
      },
      execution: {
        enableParallelExecution: this.config.enableParallelExecution,
        verbose: this.config.verbose,
        meaning: CONFIG_EXECUTION_MEANING,
      },
      models: {
        agentModels: this.config.agentModels,
        meaning: CONFIG_MODELS_MEANING,
      },
    }) as TangConfigReport;
  }

  /**
   * Main entry point: process a user request through the 三省六部 pipeline.
   *
   * Flow: 中书省 (draft) → 门下省 (review) → 尚书省 (dispatch) → 六部 (execute)
   */
  async processRequest(userRequest: string): Promise<Edict> {
    const edict = this.createEdict(userRequest);

    // Phase 1: 中书省 — Draft the plan
    this.setPhase("drafting");
    let plan = await this.draftPlan(edict, userRequest);
    edict.messages.push(plan);
    edict.status = "drafted";

    // Phase 2: 门下省 — Review the plan (with retry loop)
    this.setPhase("reviewing");
    let reviewRounds = 0;
    let approved = false;

    while (reviewRounds < this.config.maxReviewRounds && !approved) {
      const review = await this.reviewPlan(edict);
      edict.messages.push(review);
      reviewRounds++;

      const verdict = this.parseVerdict(review.content);
      if (verdict === "approve") {
        approved = true;
        edict.status = "approved";
      } else {
        edict.status = "rejected";
        if (reviewRounds >= this.config.maxReviewRounds) {
          break;
        }
        const revision = await this.revisePlan(edict, review.content);
        edict.messages.push(revision);
        this.setPhase("drafting");
        plan = await this.draftPlan(edict, userRequest, review.content);
        edict.messages.push(plan);
        edict.status = "drafted";
        this.setPhase("reviewing");
      }
    }

    if (!approved) {
      edict.status = "failed";
      this.emit("menxia", `Edict ${edict.id} rejected after ${this.config.maxReviewRounds} review rounds.`);
      edict.updatedAt = Date.now();
      this.persistState();
      this.setPhase("idle");
      return edict;
    }

    // Phase 3: 尚书省 — Dispatch to ministries
    this.setPhase("dispatching");
    const dispatchResult = await this.dispatchTasks(edict);
    edict.messages.push(...dispatchResult.tasks.map((dispatch) => this.emit(
      "shangshu",
      `Dispatched to ${dispatch.ministry}: ${dispatch.description}`,
      dispatchResult.metadata,
    )));
    edict.status = "dispatched";

    // Phase 4: 六部 — Execute tasks
    this.setPhase("executing");
    edict.status = "executing";

    if (this.config.enableParallelExecution) {
      await this.executeParallel(edict, dispatchResult.tasks);
    } else {
      await this.executeSequential(edict, dispatchResult.tasks);
    }

    // Check results
    const allCompleted = dispatchResult.tasks.every(t => t.status === "completed");
    edict.status = allCompleted ? "completed" : "failed";
    edict.updatedAt = Date.now();

    this.setPhase("completing");

    const summary = this.buildSummary(edict, dispatchResult.tasks);
    edict.messages.push(this.emit("shangshu", summary));
    this.persistState();

    this.setPhase("idle");
    return edict;
  }

  private createEdict(description: string): Edict {
    const edict: Edict = {
      id: generateEdictId(),
      title: description.slice(0, 80),
      description,
      status: "drafted",
      origin: "zhongshu",
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    this.state.edicts.set(edict.id, edict);
    this.persistState();
    return edict;
  }

  private async draftPlan(edict: Edict, userRequest: string, reviewFeedback?: string): Promise<AgentMessage> {
    const runtimePlan = await this.runtime?.draftPlan(edict, userRequest, reviewFeedback);

    if (runtimePlan) {
      if (runtimePlan.title) {
        edict.title = runtimePlan.title;
      }

      return this.emit(
        "zhongshu",
        JSON.stringify(
          {
            type: "plan",
            edictId: edict.id,
            title: runtimePlan.title,
            description: runtimePlan.description,
            tasks: runtimePlan.tasks,
          },
          null,
          2,
        ),
        {
          source: "client",
          sessionID: runtimePlan.sessionID,
          providerID: runtimePlan.providerID,
          modelID: runtimePlan.modelID,
          raw: runtimePlan.raw,
        },
      );
    }

    const dept = DEPARTMENTS.zhongshu;
    const prompt = `${dept.systemPrompt}\n\nUser Request:\n${userRequest}${reviewFeedback ? `\n\nReview Feedback to Address:\n${reviewFeedback}` : ""}\n\nProduce a structured execution plan.`;

    return this.emit(
      "zhongshu",
      JSON.stringify(
        {
          type: "plan",
          edictId: edict.id,
          prompt,
          tasks: this.inferTasks(userRequest),
        },
        null,
        2,
      ),
      { source: "local" },
    );
  }

  private async reviewPlan(edict: Edict): Promise<AgentMessage> {
    const lastPlan = edict.messages.filter(m => m.role === "zhongshu").pop();
    const remainingBudget = Math.max(0, this.state.tokenBudget.total - this.state.tokenBudget.used);
    const runtimeReview = await this.runtime?.reviewPlan(edict, lastPlan?.content ?? "{}", remainingBudget);

    if (runtimeReview) {
      return this.emit(
        "menxia",
        JSON.stringify(
          {
            type: "review",
            edictId: edict.id,
            verdict: runtimeReview.verdict,
            amendments: runtimeReview.amendments,
            reasons: runtimeReview.reasons,
          },
          null,
          2,
        ),
        {
          source: "client",
          sessionID: runtimeReview.sessionID,
          providerID: runtimeReview.providerID,
          modelID: runtimeReview.modelID,
          raw: runtimeReview.raw,
        },
      );
    }

    let tasks: Array<{ ministry: MinistryId; description: string }> = [];

    try {
      const parsed = JSON.parse(lastPlan?.content || "{}");
      tasks = Array.isArray(parsed.tasks) ? parsed.tasks : [];
    } catch {
      tasks = [];
    }

    const estimatedBudget = tasks.reduce((sum, task) => sum + this.estimateTaskCost(task.description), 0);
    const reasons: string[] = [];

    if (tasks.length === 0) {
      reasons.push("Plan contains no dispatchable ministry tasks");
    }

    if (estimatedBudget > remainingBudget) {
      reasons.push("Estimated work exceeds remaining token budget");
    }

    const verdict = reasons.length === 0 ? "approve" : "reject";

    return this.emit(
      "menxia",
      JSON.stringify(
        {
          type: "review",
          edictId: edict.id,
          verdict,
          amendments: [],
          reasons: reasons.length === 0
            ? ["Plan structure is sound", "Resource estimates fit within current budget"]
            : reasons,
        },
        null,
        2,
      ),
      { source: "local" },
    );
  }

  private async reviewTaskExecution(edict: Edict, task: MinistryTask): Promise<AgentMessage> {
    let runtimeReviewFailure: string | undefined;

    try {
      const runtimeReview = await this.runtime?.reviewTaskExecution?.(edict, task);

      if (runtimeReview) {
        return this.emit(
          "menxia",
          JSON.stringify(
            {
              type: "execution_review",
              edictId: edict.id,
              taskId: task.id,
              ministry: task.ministry,
              verdict: runtimeReview.verdict,
              amendments: runtimeReview.amendments,
              reasons: runtimeReview.reasons,
            },
            null,
            2,
          ),
          {
            source: "client",
            sessionID: runtimeReview.sessionID,
            providerID: runtimeReview.providerID,
            modelID: runtimeReview.modelID,
            raw: runtimeReview.raw,
          },
        );
      }
    } catch (runtimeError) {
      runtimeReviewFailure = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
    }

    const reasons: string[] = [];
    const amendments: string[] = [];

    if (task.status !== "completed") {
      reasons.push(task.error ? `Execution failed: ${task.error}` : "Execution did not complete successfully.");
      amendments.push("Retry the ministry task and resolve the execution error before resubmitting.");
    }

    if (!task.result?.trim()) {
      reasons.push("Execution did not produce a usable result.");
      amendments.push("Produce a concrete result before resubmitting for review.");
    }

    const verdict: "approve" | "reject" = reasons.length === 0 ? "approve" : "reject";

    return this.emit(
      "menxia",
      JSON.stringify(
        {
          type: "execution_review",
          edictId: edict.id,
          taskId: task.id,
          ministry: task.ministry,
          verdict,
          amendments,
          reasons: verdict === "approve"
            ? [
                runtimeReviewFailure
                  ? `Runtime execution review failed (${runtimeReviewFailure}); local execution review accepted the result.`
                  : "Execution result satisfies the dispatched task.",
              ]
            : reasons,
        },
        null,
        2,
      ),
      {
        source: "local",
        ...(runtimeReviewFailure
          ? {
              fallbackFrom: "client",
              error: runtimeReviewFailure,
            }
          : {}),
      },
    );
  }

  private async revisePlan(edict: Edict, feedback: string): Promise<AgentMessage> {
    return this.emit(
      "zhongshu",
      JSON.stringify(
        {
          type: "revision",
          edictId: edict.id,
          action: "redraft_and_resubmit",
          feedback,
          revisedPlan: "Preparing a revised plan that addresses the latest Menxia review feedback.",
        },
        null,
        2,
      ),
    );
  }

  private parseReviewPayload(reviewContent: string): {
    verdict: "approve" | "reject";
    amendments: string[];
    reasons: string[];
  } {
    try {
      const parsed = JSON.parse(reviewContent) as {
        verdict?: "approve" | "reject";
        amendments?: string[];
        reasons?: string[];
      };

      return {
        verdict: parsed.verdict === "reject" ? "reject" : "approve",
        amendments: Array.isArray(parsed.amendments) ? parsed.amendments : [],
        reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      };
    } catch {
      return {
        verdict: reviewContent.includes("reject") ? "reject" : "approve",
        amendments: [],
        reasons: [],
      };
    }
  }

  private parseVerdict(reviewContent: string): "approve" | "reject" {
    return this.parseReviewPayload(reviewContent).verdict;
  }

  private inferTasks(request: string): Array<{ ministry: MinistryId; description: string }> {
    const tasks: Array<{ ministry: MinistryId; description: string }> = [];
    const lower = request.toLowerCase();

    if (includesAny(lower, ["delegate", "assign", "parallel", "orchestrate", "coordinate", "agent", "agents"])) {
      this.appendUniqueTask(tasks, {
        ministry: "personnel",
        description: "Assign ministries and execution strategy",
      });
    }

    if (includesAny(lower, ["budget", "cost", "token", "resource", "resources"])) {
      this.appendUniqueTask(tasks, {
        ministry: "revenue",
        description: "Estimate and allocate orchestration budget",
      });
    }

    if (lower.includes("build") || lower.includes("scaffold") || lower.includes("create project")) {
      this.appendUniqueTask(tasks, { ministry: "works", description: "Set up project infrastructure" });
    }
    if (lower.includes("code") || lower.includes("implement") || lower.includes("write")) {
      this.appendUniqueTask(tasks, { ministry: "military", description: "Execute code implementation" });
    }
    if (lower.includes("test") || lower.includes("validate") || lower.includes("check")) {
      this.appendUniqueTask(tasks, { ministry: "justice", description: "Run validation and tests" });
    }
    if (lower.includes("format") || lower.includes("lint") || lower.includes("style")) {
      this.appendUniqueTask(tasks, { ministry: "rites", description: "Enforce style and formatting" });
    }

    if (tasks.length === 0) {
      this.appendUniqueTask(tasks, { ministry: "military", description: request.trim() || "Execute requested work" });
    }

    if (tasks.length > 1) {
      this.appendUniqueTask(tasks, {
        ministry: "personnel",
        description: "Coordinate ministry assignment and sequencing",
      });
      this.appendUniqueTask(tasks, {
        ministry: "revenue",
        description: "Track estimated budget across dispatched ministries",
      });
    }

    return tasks;
  }

  private createMinistryTask(edict: Edict, task: { ministry: MinistryId; description: string }): MinistryTask {
    return {
      id: generateTaskId(),
      edictId: edict.id,
      ministry: task.ministry,
      description: task.description,
      status: "pending",
    };
  }

  private async dispatchTasks(edict: Edict): Promise<{
    tasks: MinistryTask[];
    metadata?: Record<string, unknown>;
  }> {
    const lastPlan = edict.messages.filter(m => m.role === "zhongshu").pop();
    try {
      const runtimeDispatch = await this.runtime?.dispatchTasks?.(edict, lastPlan?.content ?? "{}");

      if (runtimeDispatch) {
        return {
          tasks: runtimeDispatch.tasks.map((task) => this.createMinistryTask(edict, task)),
          metadata: {
            source: "client",
            sessionID: runtimeDispatch.sessionID,
            providerID: runtimeDispatch.providerID,
            modelID: runtimeDispatch.modelID,
            raw: runtimeDispatch.raw,
          },
        };
      }
    } catch (runtimeError) {
      const error = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
      const sessionID = typeof (runtimeError as { sessionID?: unknown }).sessionID === "string"
        ? (runtimeError as { sessionID: string }).sessionID
        : undefined;
      const providerID = typeof (runtimeError as { providerID?: unknown }).providerID === "string"
        ? (runtimeError as { providerID: string }).providerID
        : undefined;
      const modelID = typeof (runtimeError as { modelID?: unknown }).modelID === "string"
        ? (runtimeError as { modelID: string }).modelID
        : undefined;
      const raw = typeof (runtimeError as { raw?: unknown }).raw === "string"
        ? (runtimeError as { raw: string }).raw
        : undefined;

      let inferredTasks: Array<{ ministry: MinistryId; description: string }>;
      try {
        const parsed = JSON.parse(lastPlan?.content || "{}");
        inferredTasks = parsed.tasks || this.inferTasks(edict.description);
      } catch {
        inferredTasks = this.inferTasks(edict.description);
      }

      return {
        tasks: inferredTasks.map((task) => this.createMinistryTask(edict, task)),
        metadata: {
          source: "local",
          fallback: "local",
          fallbackFrom: "client",
          error,
          ...(sessionID ? { sessionID } : {}),
          ...(providerID ? { providerID } : {}),
          ...(modelID ? { modelID } : {}),
          ...(raw ? { raw } : {}),
        },
      };
    }

    let inferredTasks: Array<{ ministry: MinistryId; description: string }>;
    try {
      const parsed = JSON.parse(lastPlan?.content || "{}");
      inferredTasks = parsed.tasks || this.inferTasks(edict.description);
    } catch {
      inferredTasks = this.inferTasks(edict.description);
    }

    return {
      tasks: inferredTasks.map((task) => this.createMinistryTask(edict, task)),
      metadata: { source: "local" },
    };
  }

  private async executeParallel(edict: Edict, tasks: MinistryTask[]): Promise<void> {
    const chunks = this.chunk(tasks, this.config.maxConcurrentMinistries);

    for (const batch of chunks) {
      await Promise.all(batch.map(task => this.executeTask(edict, task)));
    }
  }

  private async executeSequential(edict: Edict, tasks: MinistryTask[]): Promise<void> {
    for (const task of tasks) {
      await this.executeTask(edict, task);
    }
  }

  private async executeTask(edict: Edict, task: MinistryTask): Promise<void> {
    this.state.activeTasks.set(task.id, task);
    task.status = "active";
    task.startedAt ??= Date.now();
    this.persistState();

    try {
      const maxAttempts = Math.max(1, this.config.maxReviewRounds);
      let reviewFeedback: string | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        task.status = "active";
        task.result = undefined;
        task.error = undefined;

        this.emitForEdict(
          edict,
          task.ministry,
          attempt === 1 ? `Starting: ${task.description}` : `Retrying attempt ${attempt}: ${task.description}`,
        );
        this.recordBudgetUsage(task.ministry, task.description);
        const executionCompleted = await this.executeTaskAttempt(edict, task, reviewFeedback);

        const executionReview = await this.reviewTaskExecution(edict, task);
        edict.messages.push(executionReview);
        const reviewPayload = this.parseReviewPayload(executionReview.content);

        if (
          attempt > 1
          || reviewPayload.verdict === "reject"
          || executionReview.metadata?.fallbackFrom === "client"
        ) {
          task.audit = {
            ...(task.audit ?? { executionSource: "local" }),
            attemptCount: attempt,
            reviewStatus: reviewPayload.verdict,
            reviewReasons: reviewPayload.reasons,
            reviewAmendments: reviewPayload.amendments,
            reviewSessionID: typeof executionReview.metadata?.sessionID === "string"
              ? executionReview.metadata.sessionID
              : undefined,
          };
        }

        if (reviewPayload.verdict === "approve" && executionCompleted) {
          task.completedAt = Date.now();
          return;
        }

        if (attempt >= maxAttempts) {
          task.status = "failed";
          task.error = reviewPayload.reasons[0]
            ?? task.error
            ?? `Execution review rejected ${task.description} after ${attempt} attempt(s).`;
          task.completedAt = Date.now();
          this.emitForEdict(
            edict,
            "shangshu",
            `Execution review failed for ${task.ministry} after ${attempt} attempt(s): ${task.error}`,
          );
          return;
        }

        reviewFeedback = executionReview.content;
        this.emitForEdict(
          edict,
          "shangshu",
          `Re-dispatching ${task.ministry} after execution review rejection.`,
          {
            reviewVerdict: reviewPayload.verdict,
            reviewReasons: reviewPayload.reasons,
          },
        );
        this.persistState();
      }
    } catch (err) {
      task.status = "failed";
      task.error = err instanceof Error ? err.message : String(err);
      task.audit ??= { executionSource: "local" };
      task.completedAt = Date.now();
      this.emitForEdict(edict, task.ministry, `Failed: ${task.description} — ${task.error}`, { source: "local" });
    } finally {
      this.state.activeTasks.delete(task.id);
      this.persistState();
    }
  }

  private async executeTaskAttempt(edict: Edict, task: MinistryTask, reviewFeedback?: string): Promise<boolean> {
    let localFallbackMetadata: Record<string, unknown> | undefined;
    const runtimeAttemptLimit = task.ministry === "works" ? 2 : 1;
    let lastRuntimeFailure:
      | {
          error: string;
          sessionID?: string;
          raw?: string;
          providerID?: string;
          modelID?: string;
        }
      | undefined;

    for (let runtimeAttempt = 1; runtimeAttempt <= runtimeAttemptLimit; runtimeAttempt += 1) {
      try {
        const runtimeExecution = await this.runtime?.executeTask(edict, task, reviewFeedback);

        if (!runtimeExecution) {
          break;
        }

        if (runtimeExecution.status === "completed") {
          task.status = runtimeExecution.status;
          task.result = runtimeExecution.result;
          task.error = runtimeExecution.error;
          task.audit = {
            executionSource: "client",
            clientStatus: runtimeExecution.status,
            clientAttemptCount: runtimeAttempt,
            clientError: runtimeExecution.error,
            clientRaw: runtimeExecution.raw,
            clientSessionID: runtimeExecution.sessionID,
            clientProviderID: runtimeExecution.providerID,
            clientModelID: runtimeExecution.modelID,
          };
          this.emitForEdict(
            edict,
            task.ministry,
            "Completed: " + task.description,
            {
              source: "client",
              sessionID: runtimeExecution.sessionID,
              providerID: runtimeExecution.providerID,
              modelID: runtimeExecution.modelID,
              raw: runtimeExecution.raw,
            },
          );
          return true;
        }

        lastRuntimeFailure = {
          error: runtimeExecution.error ?? "OpenCode runtime execution failed.",
          sessionID: runtimeExecution.sessionID,
          raw: runtimeExecution.raw,
          providerID: runtimeExecution.providerID,
          modelID: runtimeExecution.modelID,
        };

        this.emitForEdict(
          edict,
          task.ministry,
          "Failed: " + task.description,
          {
            source: "client",
            sessionID: runtimeExecution.sessionID,
            providerID: runtimeExecution.providerID,
            modelID: runtimeExecution.modelID,
            raw: runtimeExecution.raw,
            error: runtimeExecution.error,
            ...(runtimeAttempt >= runtimeAttemptLimit ? { fallback: "local" } : {}),
          },
        );

        if (runtimeAttempt < runtimeAttemptLimit) {
          continue;
        }
      } catch (runtimeError) {
        const runtimeErrorMessage = runtimeError instanceof Error ? runtimeError.message : String(runtimeError);
        const runtimeSessionID = typeof (runtimeError as { sessionID?: unknown }).sessionID === "string"
          ? (runtimeError as { sessionID: string }).sessionID
          : undefined;
        const runtimeRaw = typeof (runtimeError as { raw?: unknown }).raw === "string"
          ? (runtimeError as { raw: string }).raw
          : undefined;
        const runtimeProviderID = typeof (runtimeError as { providerID?: unknown }).providerID === "string"
          ? (runtimeError as { providerID: string }).providerID
          : undefined;
        const runtimeModelID = typeof (runtimeError as { modelID?: unknown }).modelID === "string"
          ? (runtimeError as { modelID: string }).modelID
          : undefined;

        lastRuntimeFailure = {
          error: runtimeErrorMessage,
          sessionID: runtimeSessionID,
          raw: runtimeRaw,
          providerID: runtimeProviderID,
          modelID: runtimeModelID,
        };

        this.emitForEdict(
          edict,
          task.ministry,
          "Failed: " + task.description,
          {
            source: "client",
            error: runtimeErrorMessage,
            ...(runtimeSessionID ? { sessionID: runtimeSessionID } : {}),
            ...(runtimeRaw ? { raw: runtimeRaw } : {}),
            ...(runtimeProviderID ? { providerID: runtimeProviderID } : {}),
            ...(runtimeModelID ? { modelID: runtimeModelID } : {}),
            ...(runtimeAttempt >= runtimeAttemptLimit ? { fallback: "local" } : {}),
          },
        );

        if (runtimeAttempt < runtimeAttemptLimit) {
          continue;
        }
      }

      if (lastRuntimeFailure) {
        localFallbackMetadata = {
          source: "local",
          fallbackFrom: "client",
          clientAttemptCount: runtimeAttemptLimit,
          clientError: lastRuntimeFailure.error,
          ...(lastRuntimeFailure.sessionID ? { clientSessionID: lastRuntimeFailure.sessionID } : {}),
          ...(lastRuntimeFailure.raw ? { clientRaw: lastRuntimeFailure.raw } : {}),
          ...(lastRuntimeFailure.providerID ? { providerID: lastRuntimeFailure.providerID } : {}),
          ...(lastRuntimeFailure.modelID ? { modelID: lastRuntimeFailure.modelID } : {}),
        };
        task.audit = {
          executionSource: "local",
          fallbackFrom: "client",
          clientStatus: "failed",
          clientAttemptCount: runtimeAttemptLimit,
          clientError: lastRuntimeFailure.error,
          ...(lastRuntimeFailure.sessionID ? { clientSessionID: lastRuntimeFailure.sessionID } : {}),
          ...(lastRuntimeFailure.raw ? { clientRaw: lastRuntimeFailure.raw } : {}),
          ...(lastRuntimeFailure.providerID ? { clientProviderID: lastRuntimeFailure.providerID } : {}),
          ...(lastRuntimeFailure.modelID ? { clientModelID: lastRuntimeFailure.modelID } : {}),
        };
      }
      break;
    }

    const ministry = MINISTRIES[task.ministry];
    task.result = `[${ministry.chineseName} ${ministry.name}] Completed: ${task.description}`;
    task.status = "completed";
    task.error = undefined;
    task.audit ??= { executionSource: "local" };
    this.emitForEdict(edict, task.ministry, `Completed: ${task.description}`, localFallbackMetadata ?? { source: "local" });
    return true;
  }

  private buildSummary(edict: Edict, tasks: MinistryTask[]): string {
    const completed = tasks.filter(t => t.status === "completed").length;
    const failed = tasks.filter(t => t.status === "failed").length;
    const elapsed = Date.now() - edict.createdAt;

    return JSON.stringify({
      edictId: edict.id,
      status: edict.status,
      summary: {
        totalTasks: tasks.length,
        completed,
        failed,
        elapsedMs: elapsed,
      },
      results: tasks.map(t => ({
        ministry: t.ministry,
        status: t.status,
        result: t.result,
        error: t.error,
        audit: t.audit,
      })),
    }, null, 2);
  }

  private getEdictSummaryPayload(edict: Edict): {
    edictId: string;
    status: string;
    summary?: { totalTasks?: number };
    results?: Array<{
      ministry: MinistryId;
      status: MinistryTask["status"];
      result?: string;
      error?: string;
      audit?: {
        executionSource?: "client" | "local";
        fallbackFrom?: "client";
        clientStatus?: "completed" | "failed";
        clientAttemptCount?: number;
        clientError?: string;
        clientRaw?: string;
        clientSessionID?: string;
        clientProviderID?: string;
        clientModelID?: string;
        attemptCount?: number;
        reviewStatus?: "approve" | "reject";
        reviewReasons?: string[];
        reviewAmendments?: string[];
        reviewSessionID?: string;
      };
    }>; 
  } | undefined {
    for (let index = edict.messages.length - 1; index >= 0; index -= 1) {
      const message = edict.messages[index];
      if (!message || message.role !== "shangshu") {
        continue;
      }

      try {
        const parsed = JSON.parse(message.content) as {
          edictId?: string;
          status?: string;
          summary?: { totalTasks?: number };
          results?: Array<{
            ministry: MinistryId;
            status: MinistryTask["status"];
            result?: string;
            error?: string;
            audit?: {
              executionSource?: "client" | "local";
              fallbackFrom?: "client";
              clientStatus?: "completed" | "failed";
              clientAttemptCount?: number;
              clientError?: string;
              clientRaw?: string;
              clientSessionID?: string;
              clientProviderID?: string;
              clientModelID?: string;
              attemptCount?: number;
              reviewStatus?: "approve" | "reject";
              reviewReasons?: string[];
              reviewAmendments?: string[];
              reviewSessionID?: string;
            };
          }>;
        };

        if (Array.isArray(parsed.results)) {
          return {
            edictId: parsed.edictId ?? edict.id,
            status: parsed.status ?? edict.status,
            summary: parsed.summary,
            results: parsed.results,
          };
        }
      } catch {
        continue;
      }
    }

    return undefined;
  }

  private buildDiagnosticsOperatorNote(entry: {
    executionSource: "client" | "local";
    fallbackFrom?: "client";
    attemptCount?: number;
    clientAttemptCount?: number;
    reviewStatus?: "approve" | "reject";
  }): string {
    if (entry.executionSource === "client" && (entry.clientAttemptCount ?? 1) > 1) {
      return `Completed through OpenCode client execution after ${entry.clientAttemptCount} runtime attempts.`;
    }

    if ((entry.attemptCount ?? 1) > 1 && entry.reviewStatus === "approve") {
      return `Completed after ${entry.attemptCount} execution attempts following Menxia execution review.`;
    }

    if (entry.reviewStatus === "reject") {
      return `Execution result remained rejected after ${entry.attemptCount ?? 1} attempt${(entry.attemptCount ?? 1) === 1 ? "" : "s"}.`;
    }

    if (entry.fallbackFrom === "client") {
      if ((entry.clientAttemptCount ?? 1) > 1) {
        return `Completed locally after ${entry.clientAttemptCount} OpenCode client execution failures.`;
      }

      return "Completed locally after OpenCode client execution failed.";
    }

    if (entry.executionSource === "client") {
      return "Completed through OpenCode client execution.";
    }

    return "Completed through local Tang execution.";
  }

  private getEdictReviewPayloads(edict: Edict): Array<{
    verdict?: "approve" | "reject";
    reasons?: string[];
  }> {
    return edict.messages
      .filter((message) => message.role === "menxia")
      .flatMap((message) => {
        try {
          const parsed = JSON.parse(message.content) as {
            verdict?: "approve" | "reject";
            reasons?: string[];
          };

          return [parsed];
        } catch {
          return [];
        }
      });
  }

  private getTerminalReviewPayload(edict: Edict): {
    verdict?: "approve" | "reject";
    reasons?: string[];
  } | undefined {
    return this.getEdictReviewPayloads(edict).at(-1);
  }

  private getEdictPlannedMinistries(edict: Edict): Set<MinistryId> {
    for (let index = edict.messages.length - 1; index >= 0; index -= 1) {
      const message = edict.messages[index];
      if (!message || message.role !== "zhongshu") {
        continue;
      }

      try {
        const parsed = JSON.parse(message.content) as {
          tasks?: Array<{ ministry?: MinistryId }>;
        };

        if (Array.isArray(parsed.tasks)) {
          return new Set(
            parsed.tasks
              .flatMap((task) => (task.ministry ? [task.ministry] : [])),
          );
        }
      } catch {
        continue;
      }
    }

    return new Set();
  }

  private buildAnomalyReasons(
    edict: Edict,
    summaryPayload: ReturnType<TangDynastyOrchestrator["getEdictSummaryPayload"]>,
  ): AuditAnomalyReason[] {
    const reasons: AuditAnomalyReason[] = [];
    const terminalReviewPayload = this.getTerminalReviewPayload(edict);

    if ((edict.status === "failed" || edict.status === "rejected") && terminalReviewPayload?.verdict === "reject") {
      const terminalRejectReason = terminalReviewPayload.reasons?.find(Boolean);
      const lowerRejectReason = terminalRejectReason?.toLowerCase();
      const isBudgetBlocked = typeof lowerRejectReason === "string" && (
        lowerRejectReason.includes("remaining token budget") ||
        (lowerRejectReason.includes("budget") && lowerRejectReason.includes("exceed")) ||
        (lowerRejectReason.includes("token") && lowerRejectReason.includes("exceed"))
      );

      if (terminalRejectReason && isBudgetBlocked) {
        reasons.push({
          type: "budget_blocked",
          detail: terminalRejectReason,
        });
      } else if (terminalRejectReason) {
        reasons.push({
          type: "review_rejected",
          detail: terminalRejectReason,
        });
      }
    }

    const fallbackCount = (summaryPayload?.results ?? []).filter(
      (result) => result.audit?.fallbackFrom === "client",
    ).length;

    if (fallbackCount > 0) {
      reasons.push({
        type: "fallback_heavy",
        detail: `${fallbackCount} ministry task${fallbackCount === 1 ? "" : "s"} used local fallback after client execution failed`,
      });
    }

    return reasons;
  }

  getAuditTrail(query: AuditTrailQuery = {}): EdictAuditTrailEntry[] {
    const { edictId, ministry, latest, limit, fallbackOnly } = query;

    const entries = this.getEdicts()
      .filter((edict) => (edictId ? edict.id === edictId : true))
      .sort(compareEdictsNewestFirst)
      .flatMap((edict) => {
      const payload = this.getEdictSummaryPayload(edict);
      if (!payload) {
        return [];
      }
      const ministries: MinistryAuditTrailEntry[] = (payload?.results ?? [])
        .map((result) => ({
        ministry: result.ministry,
        status: result.status,
        executionSource: result.audit?.executionSource ?? "local",
        fallbackFrom: result.audit?.fallbackFrom,
        clientStatus: result.audit?.clientStatus,
        clientError: result.audit?.clientError,
        attemptCount: result.audit?.attemptCount,
        reviewStatus: result.audit?.reviewStatus,
        }))
        .filter((entry) => (ministry ? entry.ministry === ministry : true))
        .filter((entry) => (fallbackOnly ? entry.fallbackFrom === "client" : true));

      if ((ministry || fallbackOnly) && ministries.length === 0) {
        return [];
      }

      return [{
        edictId: edict.id,
        title: edict.title,
        status: edict.status,
        totalTasks: ministries.length,
        clientExecutions: ministries.filter((entry) => entry.executionSource === "client").length,
        localExecutions: ministries.filter((entry) => entry.executionSource === "local").length,
        fallbackExecutions: ministries.filter((entry) => entry.fallbackFrom === "client").length,
        ministries,
      }];
    });

    if (latest) {
      return entries.slice(0, 1);
    }

    if (limit && limit > 0) {
      return entries.slice(0, limit);
    }

    return entries;
  }

  getAuditSummary(query: AuditTrailQuery = {}): AuditTrailSummary {
    const entries = this.getAuditTrail(query);
    const ministryMap = new Map<MinistryId, MinistryAuditSummaryEntry>();

    for (const entry of entries) {
      for (const ministry of entry.ministries) {
        const current = ministryMap.get(ministry.ministry) ?? {
          ministry: ministry.ministry,
          taskCount: 0,
          clientExecutions: 0,
          localExecutions: 0,
          fallbackExecutions: 0,
        };

        current.taskCount += 1;
        if (ministry.executionSource === "client") {
          current.clientExecutions += 1;
        }
        if (ministry.executionSource === "local") {
          current.localExecutions += 1;
        }
        if (ministry.fallbackFrom === "client") {
          current.fallbackExecutions += 1;
        }

        ministryMap.set(ministry.ministry, current);
      }
    }

    const ministries = Array.from(ministryMap.values());

    return {
      totalEdicts: entries.length,
      totalTasks: ministries.reduce((sum, ministry) => sum + ministry.taskCount, 0),
      clientExecutions: ministries.reduce((sum, ministry) => sum + ministry.clientExecutions, 0),
      localExecutions: ministries.reduce((sum, ministry) => sum + ministry.localExecutions, 0),
      fallbackExecutions: ministries.reduce((sum, ministry) => sum + ministry.fallbackExecutions, 0),
      ministries,
    };
  }

  getAuditAnomalies(query: AuditTrailQuery = {}): EdictAuditAnomaly[] {
    const { edictId, ministry, latest, limit, fallbackOnly } = query;

    const anomalies = this.getEdicts()
      .filter((edict) => (edictId ? edict.id === edictId : true))
      .sort(compareEdictsNewestFirst)
      .flatMap((edict) => {
        const summaryPayload = this.getEdictSummaryPayload(edict);
        const plannedMinistries = this.getEdictPlannedMinistries(edict);

        if (ministry) {
          const hasMinistry = summaryPayload
            ? (summaryPayload.results ?? []).some((result) => result.ministry === ministry)
            : plannedMinistries.has(ministry);

          if (!hasMinistry) {
            return [];
          }
        }

        const reasons = this.buildAnomalyReasons(edict, summaryPayload)
          .filter((reason) => (fallbackOnly ? reason.type === "fallback_heavy" : true));

        if (reasons.length === 0) {
          return [];
        }

        return [{
          edictId: edict.id,
          title: edict.title,
          status: edict.status,
          reasons,
        }];
      });

    if (latest) {
      return anomalies.slice(0, 1);
    }

    if (limit && limit > 0) {
      return anomalies.slice(0, limit);
    }

    return anomalies;
  }

  getAuditAnomalyHotspots(query: AuditTrailQuery = {}): AuditAnomalyHotspots {
    const anomalies = this.getAuditAnomalies(query);
    const reasonCounts = new Map<AuditAnomalyReason["type"], number>();
    const ministryCounts = new Map<MinistryId, number>();
    const edictById = new Map(this.getEdicts().map((edict) => [edict.id, edict]));

    for (const anomaly of anomalies) {
      for (const reason of anomaly.reasons) {
        reasonCounts.set(reason.type, (reasonCounts.get(reason.type) ?? 0) + 1);
      }

      const edict = edictById.get(anomaly.edictId);
      if (!edict) {
        continue;
      }

      const summaryPayload = this.getEdictSummaryPayload(edict);
      const ministries = query.ministry
        ? [query.ministry]
        : summaryPayload
          ? Array.from(new Set((summaryPayload.results ?? []).map((result) => result.ministry)))
          : Array.from(this.getEdictPlannedMinistries(edict));

      for (const ministry of ministries) {
        ministryCounts.set(ministry, (ministryCounts.get(ministry) ?? 0) + 1);
      }
    }

    const reasons: AuditAnomalyReasonCount[] = Array.from(reasonCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type));

    const ministries: AuditAnomalyMinistryHotspot[] = Array.from(ministryCounts.entries())
      .map(([ministry, count]) => ({ ministry, count }))
      .sort((left, right) => right.count - left.count || left.ministry.localeCompare(right.ministry));

    return {
      totalEdicts: anomalies.length,
      reasons,
      ministries,
      recent: anomalies,
    };
  }

  getAuditDiagnostics(query: AuditTrailQuery = {}): EdictAuditDiagnostics[] {
    const { edictId, ministry, latest, limit, fallbackOnly } = query;

    const diagnostics = this.getEdicts()
      .filter((edict) => (edictId ? edict.id === edictId : true))
      .sort((left, right) => this.compareDiagnosticsEdicts(left, right, query))
      .flatMap((edict) => {
        const summaryPayload = this.getEdictSummaryPayload(edict);
        if (!summaryPayload) {
          return [];
        }

        const ministries: MinistryAuditDiagnosticsEntry[] = (summaryPayload.results ?? [])
          .filter((result) => (ministry ? result.ministry === ministry : true))
          .map((result) => {
            const audit = result.audit;
            const executionSource = audit?.executionSource ?? "local";
            const fallbackFrom = audit?.fallbackFrom;
            const clientAttemptCount = audit?.clientAttemptCount;
            const clientError = audit?.clientError;
            const clientSessionID = audit?.clientSessionID;
            const clientProviderID = audit?.clientProviderID;
            const clientModelID = audit?.clientModelID;
            const clientRaw = audit?.clientRaw;
            const attemptCount = audit?.attemptCount;
            const reviewStatus = audit?.reviewStatus;
            const reviewReasons = audit?.reviewReasons;
            const reviewAmendments = audit?.reviewAmendments;
            return {
              ministry: result.ministry,
              status: result.status,
              executionSource,
              fallbackFrom,
              ...(clientAttemptCount ? { clientAttemptCount } : {}),
              clientError,
              clientSessionID,
              ...(clientProviderID ? { clientProviderID } : {}),
              ...(clientModelID ? { clientModelID } : {}),
              ...(this.shouldIncludeDiagnosticsRaw(edict.id, result.ministry, clientRaw, query) ? { clientRaw } : {}),
              ...(attemptCount ? { attemptCount } : {}),
              ...(reviewStatus ? { reviewStatus } : {}),
              ...(reviewReasons ? { reviewReasons } : {}),
              ...(reviewAmendments ? { reviewAmendments } : {}),
              operatorNote: this.buildDiagnosticsOperatorNote({
                executionSource,
                fallbackFrom,
                attemptCount,
                clientAttemptCount,
                reviewStatus,
              }),
            };
          })
          .filter((entry) => (fallbackOnly ? entry.fallbackFrom === "client" : true));

        if (ministries.length === 0) {
          return [];
        }

        return [{
          edictId: edict.id,
          title: edict.title,
          status: edict.status,
          summary: {
            totalTasks: ministries.length,
            clientExecutions: ministries.filter((entry) => entry.executionSource === "client").length,
            localExecutions: ministries.filter((entry) => entry.executionSource === "local").length,
            fallbackExecutions: ministries.filter((entry) => entry.fallbackFrom === "client").length,
          },
          ministries,
        }];
      });

    if (latest) {
      return diagnostics.slice(0, 1);
    }

    if (limit && limit > 0) {
      return diagnostics.slice(0, limit);
    }

    return diagnostics;
  }

  getAuditHealth(): AuditHealthReport {
    const edicts = this.getEdicts();
    const completedEdicts = edicts.filter((edict) => edict.status === "completed");
    const completedWithoutSummary = completedEdicts.filter((edict) => !this.getEdictSummaryPayload(edict));
    const activeTaskCount = this.state.activeTasks.size;
    const remainingBudget = Math.max(0, this.state.tokenBudget.total - this.state.tokenBudget.used);
    const anomalyCount = this.getAuditAnomalies().length;

    const checks: AuditHealthCheck[] = [
      this.buildStorageHealthCheck(),
      edicts.length > 0
        ? {
            id: "history",
            status: "ok",
            detail: `${edicts.length} persisted edict(s) available for audit inspection`,
            meaning: "Shows whether Tang has enough persisted edict history for operators to inspect prior work.",
          }
        : {
            id: "history",
            status: "warn",
            detail: "No persisted edicts available yet",
            meaning: "Shows whether Tang has enough persisted edict history for operators to inspect prior work.",
            recommendation: "Run tang_process first to create auditable history.",
          },
      completedWithoutSummary.length === 0
        ? {
            id: "summary_integrity",
            status: "ok",
            detail: "All completed edicts include a persisted Shangshu summary",
            meaning: "Shows whether completed edicts still have the persisted summaries required by summary-based audit views.",
          }
        : {
            id: "summary_integrity",
            status: "warn",
            detail: `${completedWithoutSummary.length} completed edict(s) are missing a final Shangshu summary`,
            meaning: "Shows whether completed edicts still have the persisted summaries required by summary-based audit views.",
            recommendation: "Re-run tang_process for affected work or inspect persisted state before trusting summary-based views.",
          },
      activeTaskCount === 0
        ? {
            id: "active_tasks",
            status: "ok",
            detail: "No residual active tasks remain in persisted state",
            meaning: "Shows whether persisted state still believes any ministry work is running.",
          }
        : {
            id: "active_tasks",
            status: "warn",
            detail: `${activeTaskCount} active task(s) remain in persisted state`,
            meaning: "Shows whether persisted state still believes any ministry work is running.",
            recommendation: "Inspect tang_status or run tang_reset if these tasks are stale.",
          },
      anomalyCount === 0
        ? {
            id: "anomalies",
            status: "ok",
            detail: "No anomaly-tagged edicts appear in persisted history",
            meaning: "Shows whether prior edict history already contains budget blocks, review rejections, or fallback-heavy executions.",
          }
        : {
            id: "anomalies",
            status: "warn",
            detail: `${anomalyCount} anomaly-tagged edict(s) detected in persisted history`,
            meaning: "Shows whether prior edict history already contains budget blocks, review rejections, or fallback-heavy executions.",
            recommendation: "Use tang_audit with view set to anomaly or hotspots before treating routine doctor output as low-risk.",
          },
      remainingBudget > 0
        ? {
            id: "budget",
            status: "ok",
            detail: `${remainingBudget} tokens remain in the current budget`,
            meaning: "Shows whether Tang still has budget headroom for additional orchestration work.",
          }
        : {
            id: "budget",
            status: "warn",
            detail: "No remaining token budget is available",
            meaning: "Shows whether Tang still has budget headroom for additional orchestration work.",
            recommendation: "Reset the Tang state or raise tokenBudgetLimit before processing more work.",
          },
    ];

    const status: AuditHealthReport["status"] = checks.some((check) => check.status === "error")
      ? "error"
      : checks.some((check) => check.status === "warn")
        ? "warn"
        : "ok";

    const prioritizedFindings = checks
      .map((check, index) => ({ check, index }))
      .filter(({ check }) => check.status !== "ok")
      .map(({ check, index }) => ({
        index,
        finding: this.buildAuditHealthFinding(check),
      }))
      .sort((left, right) => {
        return HEALTH_FINDING_PRIORITY_RANK[right.finding.priority] - HEALTH_FINDING_PRIORITY_RANK[left.finding.priority]
          || right.finding.weight - left.finding.weight
          || left.index - right.index;
      })
      .map(({ finding }) => finding);

    const riskPolicy = this.getAuditHealthRiskPolicy();
    const score = Math.max(
      0,
      100 - prioritizedFindings.reduce(
        (total, finding) => total + finding.weight * riskPolicy.priorityMultipliers[finding.priority],
        0,
      ),
    );
    const riskLevel = this.getAuditHealthRiskLevel(score, riskPolicy.riskLevelThresholds);

    return {
      status,
      riskLevel,
      score,
      riskPolicy,
      summary: status === "error"
        ? "Tang audit health found at least one blocking issue that operators should fix before trusting persisted views."
        : status === "warn"
          ? "Tang audit health is degraded but still readable; operators should review the warnings before acting on persisted views."
          : "Tang audit health is stable and ready for routine operator inspection.",
      prioritizedFindings,
      checks,
      metrics: {
        edictCount: edicts.length,
        activeTaskCount,
        anomalyCount,
        remainingBudget,
      },
    };
  }

  private buildAuditHealthFinding(check: AuditHealthCheck): AuditHealthFinding {
    return {
      checkId: check.id,
      priority: this.getAuditHealthFindingPriority(check),
      status: check.status === "error" ? "error" : "warn",
      summary: check.detail,
      recommendation: check.recommendation,
      weight: HEALTH_FINDING_WEIGHT[check.id],
    };
  }

  private getAuditHealthFindingPriority(check: AuditHealthCheck): AuditHealthFindingPriority {
    if (check.status === "error") {
      return "critical";
    }

    if (check.id === "storage" || check.id === "anomalies") {
      return "high";
    }

    if (check.id === "history") {
      return "low";
    }

    return "medium";
  }

  private getAuditHealthRiskPolicy(): AuditHealthRiskPolicy {
    const profile = this.config.healthRiskProfile;
    const { priorityMultipliers, riskLevelThresholds } = HEALTH_RISK_PROFILES[profile];

    return {
      profile,
      source: this.config.healthRiskProfileSource,
      ...(this.config.healthRiskProfileWarning
        ? { warning: this.config.healthRiskProfileWarning }
        : {}),
      scoreModel: HEALTH_SCORE_MODEL,
      priorityMultipliers,
      riskLevelThresholds,
    };
  }

  private getAuditHealthRiskLevel(
    score: number,
    thresholds: Record<AuditHealthRiskLevel, number>,
  ): AuditHealthRiskLevel {
    if (score >= thresholds.low) {
      return "low";
    }

    if (score >= thresholds.medium) {
      return "medium";
    }

    if (score >= thresholds.high) {
      return "high";
    }

    return "critical";
  }

  private buildTimelineEvent(message: AgentMessage): AuditTimelineEvent {
    const source = message.metadata?.source;
    const fallback = message.metadata?.fallback;
    const fallbackFrom = message.metadata?.fallbackFrom;
    const sessionID = message.metadata?.sessionID;
    const providerID = message.metadata?.providerID;
    const modelID = message.metadata?.modelID;
    const error = message.metadata?.error;

    return {
      role: message.role,
      timestamp: message.timestamp,
      content: message.content,
      source: source === "client" || source === "local" ? source : undefined,
      fallback: fallback === "local" ? "local" : undefined,
      fallbackFrom: fallbackFrom === "client" ? "client" : undefined,
      sessionID: typeof sessionID === "string" ? sessionID : undefined,
      providerID: typeof providerID === "string" ? providerID : undefined,
      modelID: typeof modelID === "string" ? modelID : undefined,
      error: typeof error === "string" ? error : undefined,
    };
  }

  getAuditTimeline(query: AuditTrailQuery = {}): EdictAuditTimeline[] {
    const edictIds = new Set(this.getAuditTrail(query).map((entry) => entry.edictId));

    return this.getEdicts()
      .filter((edict) => edictIds.has(edict.id))
      .sort(compareEdictsNewestFirst)
      .map((edict) => ({
        edictId: edict.id,
        title: edict.title,
        status: edict.status,
        events: edict.messages.map((message) => this.buildTimelineEvent(message)),
      }));
  }

  private getLatestEdict(): Edict | undefined {
    return this.getEdicts().sort(compareEdictsNewestFirst)[0];
  }

  private getPipelineCurrentStage(latestEdict?: Edict): PipelineStagePhase | undefined {
    if (!latestEdict) {
      return undefined;
    }

    if (this.state.phase !== "idle") {
      return this.state.phase;
    }

    if (latestEdict.status === "completed") {
      return undefined;
    }

    switch (latestEdict.status) {
      case "drafted":
        return "drafting";
      case "reviewing":
      case "rejected":
        return "reviewing";
      case "approved":
      case "dispatched":
        return "dispatching";
      case "executing":
      case "failed":
        return "executing";
    }
  }

  private getPipelineStages(latestEdict?: Edict): PipelineStageSnapshot[] {
    if (!latestEdict) {
      return PIPELINE_STAGES.map((stage) => ({
        ...stage,
        status: "pending",
      }));
    }

    if (this.state.phase === "idle" && latestEdict.status === "completed") {
      return PIPELINE_STAGES.map((stage) => ({
        ...stage,
        status: "completed",
      }));
    }

    const currentStage = this.getPipelineCurrentStage(latestEdict);
    const currentIndex = currentStage
      ? PIPELINE_STAGES.findIndex((stage) => stage.phase === currentStage)
      : -1;
    const failedStage = this.state.phase === "idle" && (latestEdict.status === "failed" || latestEdict.status === "rejected");

    return PIPELINE_STAGES.map((stage, index) => {
      let status: PipelineStageStatus = "pending";

      if (currentIndex >= 0) {
        if (index < currentIndex) {
          status = "completed";
        } else if (index === currentIndex) {
          status = failedStage ? "failed" : "active";
        }
      }

      return {
        ...stage,
        status,
      };
    });
  }

  private getPipelineFlow(stages: PipelineStageSnapshot[]): string {
    return stages
      .map((stage) => `${PIPELINE_STAGE_MARKERS[stage.status]} ${stage.phase}`)
      .join(" -> ");
  }

  getPipelineReport(recentEventLimit = 3): TangPipelineReport {
    const latestEdict = this.getLatestEdict();
    const stages = this.getPipelineStages(latestEdict);
    const activeTasks = Array.from(this.state.activeTasks.values())
      .sort((left, right) => (left.startedAt ?? 0) - (right.startedAt ?? 0))
      .map((task) => ({
        id: task.id,
        ministry: task.ministry,
        description: task.description,
        status: task.status,
        startedAt: task.startedAt,
        completedAt: task.completedAt,
      }));
    const limit = Math.max(1, recentEventLimit);

    return {
      currentPhase: this.state.phase,
      currentStage: this.getPipelineCurrentStage(latestEdict) ?? null,
      activeTaskCount: activeTasks.length,
      activeTasks,
      latestEdict: latestEdict
        ? {
            id: latestEdict.id,
            title: latestEdict.title,
            status: latestEdict.status,
            updatedAt: latestEdict.updatedAt,
          }
        : null,
      flow: this.getPipelineFlow(stages),
      stages,
      recentEvents: latestEdict
        ? latestEdict.messages.slice(-limit).map((message) => this.buildTimelineEvent(message))
        : [],
    };
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
      result.push(arr.slice(i, i + size));
    }
    return result;
  }

  getState(): OrchestrationState {
    return this.state;
  }

  getEdicts(): Edict[] {
    return Array.from(this.state.edicts.values());
  }

  getBudget(): TokenBudget {
    return this.state.tokenBudget;
  }

  resetState() {
    this.state = {
      edicts: new Map(),
      activeTasks: new Map(),
      tokenBudget: this.createBudget(),
      phase: "idle",
    };
    this.persistState();
  }
}
