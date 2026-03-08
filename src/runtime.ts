import type { Edict, MinistryTask, MinistryId } from "./types.js";

export interface DraftPlanResult {
  title?: string;
  description?: string;
  tasks: Array<{ ministry: MinistryId; description: string }>;
  sessionID?: string;
  raw?: string;
}

export interface PlanReviewResult {
  verdict: "approve" | "reject";
  amendments: string[];
  reasons: string[];
  sessionID?: string;
  raw?: string;
}

export interface TaskExecutionResult {
  status: "completed" | "failed";
  result?: string;
  error?: string;
  sessionID?: string;
  raw?: string;
}

export interface TangExecutionRuntime {
  draftPlan?(edict: Edict, userRequest: string, reviewFeedback?: string): Promise<DraftPlanResult | undefined>;
  reviewPlan?(edict: Edict, planContent: string, remainingBudget: number): Promise<PlanReviewResult | undefined>;
  executeTask?(edict: Edict, task: MinistryTask, reviewFeedback?: string): Promise<TaskExecutionResult | undefined>;
  reviewTaskExecution?(edict: Edict, task: MinistryTask): Promise<PlanReviewResult | undefined>;
}

export type TangRuntimeClient = object;

export function createOpenCodeTangRuntime(
  client?: TangRuntimeClient,
  _worktree?: string,
): TangExecutionRuntime | undefined {
  if (!client) {
    return undefined;
  }

  return {
    async draftPlan() {
      return undefined;
    },
    async reviewPlan() {
      return undefined;
    },
    async executeTask() {
      return undefined;
    },
    async reviewTaskExecution() {
      return undefined;
    },
  };
}
