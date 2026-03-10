import { DEPARTMENTS } from "./agents/departments.js";
import { MINISTRIES } from "./agents/ministries.js";
import type {
  Edict,
  MinistryId,
  MinistryTask,
  ResolvedDepartmentConfigMap,
  ResolvedMinistryConfigMap,
  TangAgentModelConfigMap,
  TangModelConfig,
  TangRuntimeAgentId,
} from "./types.js";

export interface DraftPlanResult {
  title?: string;
  description?: string;
  tasks: Array<{ ministry: MinistryId; description: string }>;
  sessionID?: string;
  providerID?: string;
  modelID?: string;
  raw?: string;
}

export interface PlanReviewResult {
  verdict: "approve" | "reject";
  amendments: string[];
  reasons: string[];
  sessionID?: string;
  providerID?: string;
  modelID?: string;
  raw?: string;
}

export interface TaskExecutionResult {
  status: "completed" | "failed";
  result?: string;
  error?: string;
  sessionID?: string;
  providerID?: string;
  modelID?: string;
  raw?: string;
}

export interface DispatchTasksResult {
  tasks: Array<{ ministry: MinistryId; description: string }>;
  sessionID?: string;
  providerID?: string;
  modelID?: string;
  raw?: string;
}

export interface TangExecutionRuntime {
  draftPlan?(edict: Edict, userRequest: string, reviewFeedback?: string): Promise<DraftPlanResult | undefined>;
  reviewPlan?(edict: Edict, planContent: string, remainingBudget: number): Promise<PlanReviewResult | undefined>;
  dispatchTasks?(edict: Edict, planContent: string): Promise<DispatchTasksResult | undefined>;
  executeTask?(edict: Edict, task: MinistryTask, reviewFeedback?: string): Promise<TaskExecutionResult | undefined>;
  reviewTaskExecution?(edict: Edict, task: MinistryTask): Promise<PlanReviewResult | undefined>;
}

type TangRuntimePromptResult = {
  info?: {
    sessionID?: string;
    providerID?: string;
    modelID?: string;
  };
  parts?: Array<{
    type?: string;
    text?: string;
  }>;
};

type TangRuntimeRequestResult<T> = Promise<{
  data?: T;
  error?: unknown;
}>;

type TangRuntimeSessionClient = {
  create(options?: { body?: { title?: string } }): TangRuntimeRequestResult<{ id?: string }>;
  prompt(options: {
    path: { id: string };
    body: {
      system: string;
      model?: TangModelConfig;
      parts: Array<{ type: "text"; text: string }>;
    };
  }): TangRuntimeRequestResult<TangRuntimePromptResult>;
};

export type TangRuntimeClient = {
  session?: TangRuntimeSessionClient;
};

type TangRuntimeError = Error & {
  sessionID?: string;
  providerID?: string;
  modelID?: string;
  raw?: string;
};

function isMinistryId(value: unknown, ministryIds: Set<string>): value is MinistryId {
  return typeof value === "string" && ministryIds.has(value);
}

function hasRuntimeSessionClient(client: TangRuntimeClient | undefined): client is { session: TangRuntimeSessionClient } {
  return Boolean(client?.session?.create && client.session.prompt);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function describeRuntimeError(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object" && "data" in error) {
    const data = (error as { data?: { message?: unknown } }).data;
    if (data && typeof data === "object" && typeof data.message === "string") {
      return data.message;
    }
  }

  return "Unknown OpenCode runtime error";
}

function createTangRuntimeError(
  message: string,
  details?: { sessionID?: string; providerID?: string; modelID?: string; raw?: string },
): TangRuntimeError {
  const error = new Error(message) as TangRuntimeError;
  error.sessionID = details?.sessionID;
  error.providerID = details?.providerID;
  error.modelID = details?.modelID;
  error.raw = details?.raw;
  return error;
}

function extractAssistantText(parts: TangRuntimePromptResult["parts"]): string {
  return (parts ?? [])
    .filter((part) => part?.type === "text" && typeof part.text === "string")
    .map((part) => part.text?.trim() ?? "")
    .filter(Boolean)
    .join("\n")
    .trim();
}

function extractStructuredJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const codeFenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeFenceMatch?.[1]) {
      return JSON.parse(codeFenceMatch[1].trim());
    }

    const start = raw.search(/[\[{]/);
    const end = Math.max(raw.lastIndexOf("}"), raw.lastIndexOf("]"));
    if (start >= 0 && end > start) {
      return JSON.parse(raw.slice(start, end + 1));
    }

    throw new Error("Runtime response did not contain valid JSON");
  }
}

function isDraftPlanResult(
  value: unknown,
  ministryIds: Set<string>,
): value is DraftPlanResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as DraftPlanResult;
  return Array.isArray(candidate.tasks)
    && candidate.tasks.length > 0
    && candidate.tasks.every((task) => (
      task
      && typeof task === "object"
      && isMinistryId(task.ministry, ministryIds)
      && isNonEmptyString(task.description)
    ))
    && (candidate.title === undefined || typeof candidate.title === "string")
    && (candidate.description === undefined || typeof candidate.description === "string");
}

function isDispatchTasksResult(
  value: unknown,
  ministryIds: Set<string>,
): value is DispatchTasksResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as DispatchTasksResult;
  return Array.isArray(candidate.tasks)
    && candidate.tasks.length > 0
    && candidate.tasks.every((task) => (
      task
      && typeof task === "object"
      && isMinistryId(task.ministry, ministryIds)
      && isNonEmptyString(task.description)
    ));
}

function isPlanReviewResult(value: unknown): value is PlanReviewResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as PlanReviewResult;
  return (candidate.verdict === "approve" || candidate.verdict === "reject")
    && Array.isArray(candidate.amendments)
    && candidate.amendments.every((item) => typeof item === "string")
    && Array.isArray(candidate.reasons)
    && candidate.reasons.every((item) => typeof item === "string");
}

function isTaskExecutionResult(value: unknown): value is TaskExecutionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const candidate = value as TaskExecutionResult;
  return (candidate.status === "completed" || candidate.status === "failed")
    && (candidate.result === undefined || typeof candidate.result === "string")
    && (candidate.error === undefined || typeof candidate.error === "string");
}

async function runRuntimePrompt(
  client: TangRuntimeSessionClient,
  title: string,
  system: string,
  prompt: string,
  model?: TangModelConfig,
): Promise<{ raw: string; sessionID: string; providerID?: string; modelID?: string }> {
  const sessionResponse = await client.create({
    body: { title },
  });

  if (sessionResponse.error) {
    throw createTangRuntimeError(
      describeRuntimeError(sessionResponse.error),
      {
        providerID: model?.providerID,
        modelID: model?.modelID,
      },
    );
  }

  const sessionID = sessionResponse.data?.id;
  if (!isNonEmptyString(sessionID)) {
    throw createTangRuntimeError(
      "OpenCode runtime did not return a session ID",
      {
        providerID: model?.providerID,
        modelID: model?.modelID,
      },
    );
  }

  const promptResponse = await client.prompt({
    path: { id: sessionID },
    body: {
      system,
      ...(model ? { model } : {}),
      parts: [{ type: "text", text: prompt }],
    },
  });

  if (promptResponse.error) {
    throw createTangRuntimeError(
      describeRuntimeError(promptResponse.error),
      {
        sessionID,
        providerID: model?.providerID,
        modelID: model?.modelID,
      },
    );
  }

  const raw = extractAssistantText(promptResponse.data?.parts);
  if (!raw) {
    throw createTangRuntimeError(
      "OpenCode runtime returned an empty response",
      {
        sessionID: promptResponse.data?.info?.sessionID ?? sessionID,
        providerID: promptResponse.data?.info?.providerID ?? model?.providerID,
        modelID: promptResponse.data?.info?.modelID ?? model?.modelID,
      },
    );
  }

  return {
    raw,
    sessionID: promptResponse.data?.info?.sessionID ?? sessionID,
    providerID: promptResponse.data?.info?.providerID ?? model?.providerID,
    modelID: promptResponse.data?.info?.modelID ?? model?.modelID,
  };
}

function buildDraftPlanPrompt(userRequest: string, ministryIds: string[], reviewFeedback?: string): string {
  return [
    `User request: ${userRequest}`,
    reviewFeedback ? `Review feedback to address: ${reviewFeedback}` : undefined,
    `Valid ministry ids: ${ministryIds.join(", ")}.`,
    'Return JSON only: {"title":"string","description":"string","tasks":[{"ministry":"works","description":"..."}]}.',
    "Choose the smallest set of ministries needed to complete the work.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildReviewPlanPrompt(planContent: string, remainingBudget: number): string {
  return [
    `Remaining token budget: ${remainingBudget}`,
    "Plan to review:",
    planContent,
    'Return JSON only: {"verdict":"approve|reject","amendments":["..."],"reasons":["..."]}.',
    "Reject plans that have no dispatchable tasks or exceed the stated budget.",
  ].join("\n\n");
}

function buildTaskExecutionPrompt(task: MinistryTask, reviewFeedback?: string): string {
  return [
    `Ministry task: ${task.description}`,
    reviewFeedback ? `Review feedback to address: ${reviewFeedback}` : undefined,
    'Return JSON only: {"status":"completed|failed","result":"string","error":"string"}.',
    "Use completed when you can provide a concrete useful result; otherwise use failed and explain why.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildDispatchTasksPrompt(planContent: string, ministryIds: string[]): string {
  return [
    "Approved plan content:",
    planContent,
    `Valid ministry ids: ${ministryIds.join(", ")}.`,
    "Dispatch the approved work to the correct ministries.",
    "Keep the task list concrete and execution-ready.",
    'Return JSON only: {"tasks":[{"ministry":"works","description":"..."}]}.',
  ].join("\n\n");
}

function buildTaskReviewPrompt(task: MinistryTask): string {
  return [
    `Task description: ${task.description}`,
    `Task status: ${task.status}`,
    `Task result: ${task.result ?? ""}`,
    `Task error: ${task.error ?? ""}`,
    'Return JSON only: {"verdict":"approve|reject","amendments":["..."],"reasons":["..."]}.',
    "Reject incomplete, empty, or failed executions.",
  ].join("\n\n");
}

export function createOpenCodeTangRuntime(
  client?: TangRuntimeClient,
  _worktree?: string,
  departments: ResolvedDepartmentConfigMap = DEPARTMENTS,
  ministries: ResolvedMinistryConfigMap = MINISTRIES,
  agentModels: TangAgentModelConfigMap = {},
): TangExecutionRuntime | undefined {
  if (!hasRuntimeSessionClient(client)) {
    return undefined;
  }

  const runtimeClient = client.session;
  const getModel = (agentId: TangRuntimeAgentId) => agentModels[agentId];
  const ministryIds = Object.keys(ministries);
  const validMinistryIds = new Set(ministryIds);

  return {
    async draftPlan(edict, userRequest, reviewFeedback) {
      try {
        const { raw, sessionID, providerID, modelID } = await runRuntimePrompt(
          runtimeClient,
          `Tang draft: ${edict.title}`,
          `${departments.zhongshu.systemPrompt}\nReturn JSON only.`,
          buildDraftPlanPrompt(userRequest, ministryIds, reviewFeedback),
          getModel("zhongshu"),
        );
        const parsed = extractStructuredJson(raw);

        if (!isDraftPlanResult(parsed, validMinistryIds)) {
          return undefined;
        }

        return {
          ...parsed,
          sessionID,
          providerID,
          modelID,
          raw,
        };
      } catch {
        return undefined;
      }
    },

    async reviewPlan(edict, planContent, remainingBudget) {
      try {
        const { raw, sessionID, providerID, modelID } = await runRuntimePrompt(
          runtimeClient,
          `Tang review: ${edict.title}`,
          `${departments.menxia.systemPrompt}\nReturn JSON only.`,
          buildReviewPlanPrompt(planContent, remainingBudget),
          getModel("menxia"),
        );
        const parsed = extractStructuredJson(raw);

        if (!isPlanReviewResult(parsed)) {
          return undefined;
        }

        return {
          ...parsed,
          sessionID,
          providerID,
          modelID,
          raw,
        };
      } catch {
        return undefined;
      }
    },

    async dispatchTasks(edict, planContent) {
      const { raw, sessionID, providerID, modelID } = await runRuntimePrompt(
        runtimeClient,
        `Tang dispatch: ${edict.title}`,
        `${departments.shangshu.systemPrompt}\nReturn JSON only.`,
        buildDispatchTasksPrompt(planContent, ministryIds),
        getModel("shangshu"),
      );

      let parsed: unknown;
      try {
        parsed = extractStructuredJson(raw);
      } catch (error) {
        throw createTangRuntimeError(
          `Invalid dispatch payload from OpenCode runtime: ${describeRuntimeError(error)}`,
          { sessionID, providerID, modelID, raw },
        );
      }

      if (!isDispatchTasksResult(parsed, validMinistryIds)) {
        throw createTangRuntimeError(
          "Invalid dispatch payload from OpenCode runtime: expected a non-empty tasks array.",
          { sessionID, providerID, modelID, raw },
        );
      }

      return {
        ...parsed,
        sessionID,
        providerID,
        modelID,
        raw,
      };
    },

    async executeTask(edict, task, reviewFeedback) {
      const { raw, sessionID, providerID, modelID } = await runRuntimePrompt(
        runtimeClient,
        `Tang execute: ${edict.title} / ${task.ministry}`,
        `${ministries[task.ministry]?.systemPrompt ?? `Execute the ${task.ministry} task.`}\nReturn JSON only.`,
        buildTaskExecutionPrompt(task, reviewFeedback),
        getModel(task.ministry),
      );
      const parsed = extractStructuredJson(raw);

      if (!isTaskExecutionResult(parsed)) {
        throw new Error("OpenCode runtime returned an invalid task execution payload");
      }

      return {
        ...parsed,
        sessionID,
        providerID,
        modelID,
        raw,
      };
    },

    async reviewTaskExecution(edict, task) {
      const { raw, sessionID, providerID, modelID } = await runRuntimePrompt(
        runtimeClient,
        `Tang execution review: ${edict.title} / ${task.ministry}`,
        `${departments.menxia.systemPrompt}\nReturn JSON only.`,
        buildTaskReviewPrompt(task),
        getModel("menxia"),
      );
      const parsed = extractStructuredJson(raw);

      if (!isPlanReviewResult(parsed)) {
        throw new Error("OpenCode runtime returned an invalid execution review payload");
      }

      return {
        ...parsed,
        sessionID,
        providerID,
        modelID,
        raw,
      };
    },
  };
}
