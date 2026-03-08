/**
 * 三省六部制 (Three Departments and Six Ministries) Type System
 *
 * Maps Tang Dynasty governance structure to multi-agent orchestration:
 *
 * 三省 (Three Departments):
 *   - 中书省 (Zhongshu) — Imperial Secretariat: Drafts edicts / plans
 *   - 门下省 (Menxia)   — Chancellery: Reviews and gates proposals
 *   - 尚书省 (Shangshu) — Department of State Affairs: Executes approved work
 *
 * 六部 (Six Ministries) under 尚书省:
 *   - 吏部 (Personnel)  — Agent role assignment and delegation
 *   - 户部 (Revenue)    — Token budget and resource management
 *   - 礼部 (Rites)      — Protocol, formatting, style enforcement
 *   - 兵部 (Military)   — Task execution and parallel orchestration
 *   - 刑部 (Justice)    — Error handling, validation, quality gates
 *   - 工部 (Works)      — Code generation, file operations, builds
 */

export type DepartmentId = "zhongshu" | "menxia" | "shangshu";

export type MinistryId =
  | "personnel" // 吏部
  | "revenue"   // 户部
  | "rites"     // 礼部
  | "military"  // 兵部
  | "justice"   // 刑部
  | "works";    // 工部

export type AgentRole = DepartmentId | MinistryId;

export interface AgentMessage {
  role: AgentRole;
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface Edict {
  id: string;
  title: string;
  description: string;
  status: EdictStatus;
  origin: DepartmentId;
  messages: AgentMessage[];
  createdAt: number;
  updatedAt: number;
}

export type EdictStatus =
  | "drafted"     // 中书省 has proposed
  | "reviewing"   // 门下省 is reviewing
  | "rejected"    // 门下省 rejected, returns to 中书省
  | "approved"    // 门下省 approved
  | "dispatched"  // 尚书省 has dispatched to ministries
  | "executing"   // Ministries are executing
  | "completed"   // All work finished
  | "failed";     // Execution failed

export interface MinistryTask {
  id: string;
  edictId: string;
  ministry: MinistryId;
  description: string;
  status: "pending" | "active" | "completed" | "failed";
  result?: string;
  error?: string;
  audit?: TaskExecutionAudit;
  startedAt?: number;
  completedAt?: number;
}

export interface TaskExecutionAudit {
  executionSource: "client" | "local";
  fallbackFrom?: "client";
  clientStatus?: "completed" | "failed";
  clientError?: string;
  clientRaw?: string;
  clientSessionID?: string;
  attemptCount?: number;
  reviewStatus?: "approve" | "reject";
  reviewReasons?: string[];
  reviewAmendments?: string[];
  reviewSessionID?: string;
}

export interface MinistryAuditTrailEntry {
  ministry: MinistryId;
  status: "pending" | "active" | "completed" | "failed";
  executionSource: "client" | "local";
  fallbackFrom?: "client";
  clientStatus?: "completed" | "failed";
  clientError?: string;
  attemptCount?: number;
  reviewStatus?: "approve" | "reject";
}

export interface EdictAuditTrailEntry {
  edictId: string;
  title: string;
  status: EdictStatus;
  totalTasks: number;
  clientExecutions: number;
  localExecutions: number;
  fallbackExecutions: number;
  ministries: MinistryAuditTrailEntry[];
}

export interface AuditTimelineEvent {
  role: AgentRole;
  timestamp: number;
  content: string;
  source?: "client" | "local";
  fallback?: "local";
  fallbackFrom?: "client";
  sessionID?: string;
  error?: string;
}

export interface EdictAuditTimeline {
  edictId: string;
  title: string;
  status: EdictStatus;
  events: AuditTimelineEvent[];
}

export interface MinistryAuditDiagnosticsEntry {
  ministry: MinistryId;
  status: MinistryTask["status"];
  executionSource: "client" | "local";
  fallbackFrom?: "client";
  clientError?: string;
  clientSessionID?: string;
  clientRaw?: string;
  attemptCount?: number;
  reviewStatus?: "approve" | "reject";
  reviewReasons?: string[];
  reviewAmendments?: string[];
  operatorNote: string;
}

export interface EdictAuditDiagnostics {
  edictId: string;
  title: string;
  status: EdictStatus;
  summary: {
    totalTasks: number;
    clientExecutions: number;
    localExecutions: number;
    fallbackExecutions: number;
  };
  ministries: MinistryAuditDiagnosticsEntry[];
}

export type AuditAnomalyReasonType = "budget_blocked" | "review_rejected" | "fallback_heavy";

export interface AuditAnomalyReason {
  type: AuditAnomalyReasonType;
  detail: string;
}

export interface EdictAuditAnomaly {
  edictId: string;
  title: string;
  status: EdictStatus;
  reasons: AuditAnomalyReason[];
}

export interface AuditAnomalyReasonCount {
  type: AuditAnomalyReasonType;
  count: number;
}

export interface AuditAnomalyMinistryHotspot {
  ministry: MinistryId;
  count: number;
}

export interface AuditAnomalyHotspots {
  totalEdicts: number;
  reasons: AuditAnomalyReasonCount[];
  ministries: AuditAnomalyMinistryHotspot[];
  recent: EdictAuditAnomaly[];
}

export type AuditHealthStatus = "ok" | "warn" | "error";

export type StorageLoadStatus = "not_configured" | "missing" | "loaded" | "corrupt";

export type AuditHealthCheckId =
  | "storage"
  | "history"
  | "summary_integrity"
  | "active_tasks"
  | "anomalies"
  | "budget";

export interface AuditHealthCheck {
  id: AuditHealthCheckId;
  status: AuditHealthStatus;
  detail: string;
  meaning: string;
  recommendation?: string;
}

export type AuditHealthFindingPriority = "critical" | "high" | "medium" | "low";
export type AuditHealthRiskLevel = "critical" | "high" | "medium" | "low";
export type HealthRiskProfile = "balanced" | "strict" | "relaxed";
export type HealthRiskProfileSource = "default" | "config" | "env" | "env-invalid-fallback";

export interface AuditHealthRiskPolicy {
  profile: HealthRiskProfile;
  source: HealthRiskProfileSource;
  warning?: string;
  scoreModel: "max(0, 100 - Σ(weight × priorityMultiplier))";
  priorityMultipliers: Record<AuditHealthFindingPriority, number>;
  riskLevelThresholds: Record<AuditHealthRiskLevel, number>;
}

export interface AuditHealthFinding {
  checkId: AuditHealthCheckId;
  priority: AuditHealthFindingPriority;
  status: Exclude<AuditHealthStatus, "ok">;
  summary: string;
  recommendation?: string;
  weight: number;
}

export interface AuditHealthReport {
  status: AuditHealthStatus;
  riskLevel: AuditHealthRiskLevel;
  score: number;
  riskPolicy: AuditHealthRiskPolicy;
  summary: string;
  prioritizedFindings: AuditHealthFinding[];
  checks: AuditHealthCheck[];
  metrics: {
    edictCount: number;
    activeTaskCount: number;
    anomalyCount: number;
    remainingBudget: number;
  };
}

export type TangRuntimeMode = "local-only" | "client-with-local-fallback";

export type TangConfigFileSource =
  | "auto-generated"
  | "file"
  | "invalid-file-fallback"
  | "write-failed-fallback";

export interface TangConfigFileMetadata {
  path: string;
  source: TangConfigFileSource;
  autoGenerated: boolean;
  foundOpencodeConfig: boolean;
  meaning: string;
}

export interface TangConfigReport {
  summary: string;
  status: "ok" | "warn";
  warningCount: number;
  warnings: string[];
  configFile?: TangConfigFileMetadata;
  storage: {
    path?: string;
    status: StorageLoadStatus;
    meaning: string;
  };
  runtime: {
    mode: TangRuntimeMode;
    meaning: string;
  };
  limits: {
    maxConcurrentMinistries: number;
    maxReviewRounds: number;
    tokenBudgetLimit: number;
    meaning: string;
  };
  health: {
    riskProfile: HealthRiskProfile;
    source: HealthRiskProfileSource;
    warning?: string;
    meaning: string;
  };
  execution: {
    enableParallelExecution: boolean;
    verbose: boolean;
    meaning: string;
  };
}

export type AuditTrailView = "entries" | "summary" | "timeline" | "anomaly" | "hotspots" | "health" | "diagnostics";

export interface MinistryAuditSummaryEntry {
  ministry: MinistryId;
  taskCount: number;
  clientExecutions: number;
  localExecutions: number;
  fallbackExecutions: number;
}

export interface AuditTrailSummary {
  totalEdicts: number;
  totalTasks: number;
  clientExecutions: number;
  localExecutions: number;
  fallbackExecutions: number;
  ministries: MinistryAuditSummaryEntry[];
}

export interface AuditTrailQuery {
  edictId?: string;
  ministry?: MinistryId;
  latest?: boolean;
  limit?: number;
  fallbackOnly?: boolean;
  includeRaw?: boolean;
  rawEdictId?: string;
  rawMinistry?: MinistryId;
  view?: AuditTrailView;
}

export interface DepartmentConfig {
  id: DepartmentId;
  name: string;
  chineseName: string;
  systemPrompt: string;
}

export interface MinistryConfig {
  id: MinistryId;
  name: string;
  chineseName: string;
  department: "shangshu";
  systemPrompt: string;
  tools: string[];
}

export interface OrchestrationState {
  edicts: Map<string, Edict>;
  activeTasks: Map<string, MinistryTask>;
  tokenBudget: TokenBudget;
  phase: OrchestrationPhase;
}

export type OrchestrationPhase =
  | "idle"
  | "drafting"    // 中书省 working
  | "reviewing"   // 门下省 reviewing
  | "dispatching" // 尚书省 dispatching
  | "executing"   // 六部 executing
  | "completing"; // Wrapping up

export type PipelineStagePhase = Exclude<OrchestrationPhase, "idle">;

export type PipelineStageStatus = "pending" | "active" | "completed" | "failed";

export interface PipelineStageSnapshot {
  phase: PipelineStagePhase;
  label: string;
  chineseLabel: string;
  status: PipelineStageStatus;
}

export interface PipelineActiveTaskSnapshot {
  id: string;
  ministry: MinistryId;
  description: string;
  status: MinistryTask["status"];
  startedAt?: number;
  completedAt?: number;
}

export interface PipelineEdictSnapshot {
  id: string;
  title: string;
  status: EdictStatus;
  updatedAt: number;
}

export interface TangPipelineReport {
  currentPhase: OrchestrationPhase;
  currentStage: PipelineStagePhase | null;
  activeTaskCount: number;
  activeTasks: PipelineActiveTaskSnapshot[];
  latestEdict: PipelineEdictSnapshot | null;
  flow: string;
  stages: PipelineStageSnapshot[];
  recentEvents: AuditTimelineEvent[];
}

export interface TokenBudget {
  total: number;
  used: number;
  perMinistry: Record<MinistryId, number>;
}

export interface PluginConfig {
  maxConcurrentMinistries: number;
  maxReviewRounds: number;
  tokenBudgetLimit: number;
  healthRiskProfile: HealthRiskProfile;
  healthRiskProfileSource: HealthRiskProfileSource;
  healthRiskProfileWarning?: string;
  enableParallelExecution: boolean;
  verbose: boolean;
  configWarnings?: string[];
  configFile?: TangConfigFileMetadata;
}

export interface PersistedOrchestrationState {
  edicts: Edict[];
  activeTasks: MinistryTask[];
  tokenBudget: TokenBudget;
  phase: OrchestrationPhase;
}
