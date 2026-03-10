import { $ } from "bun";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import type { PluginInput, ToolContext } from "@opencode-ai/plugin";
import { afterEach, describe, expect, test } from "bun:test";
import { createOpencodeClient } from "@opencode-ai/sdk";
import { fileURLToPath } from "node:url";
import { TangDynastyOrchestrator } from "./orchestrator.js";
import TangDynastyPlugin from "./plugin.js";
import type { TangExecutionRuntime } from "./runtime.js";

const tempDirs: string[] = [];
const cleanRegressionStateFixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "test-fixtures",
  "opencode-clean-regression-state.json",
);

function createWorktree() {
  const directory = mkdtempSync(join(tmpdir(), "oh-my-tang-dynasty-plugin-"));
  tempDirs.push(directory);
  return directory;
}

function writeOpencodeConfig(worktree: string, relativeDirectory = "config") {
  const directory = join(worktree, relativeDirectory);
  mkdirSync(directory, { recursive: true });
  const opencodeConfigPath = join(directory, "opencode.json");
  writeFileSync(opencodeConfigPath, JSON.stringify({ plugin: ["oh-my-tang-dynasty"] }, null, 2));
  return opencodeConfigPath;
}

function writeTangConfig(worktree: string, config: unknown, relativeDirectory = ".") {
  const directory = join(worktree, relativeDirectory);
  mkdirSync(directory, { recursive: true });
  const tangConfigPath = join(directory, ".oh-my-tang.json");
  writeFileSync(tangConfigPath, JSON.stringify(config, null, 2));
  return tangConfigPath;
}

function createPluginInput(worktree: string, client = createOpencodeClient({
  baseUrl: "http://127.0.0.1:1",
  directory: worktree,
})): PluginInput {
  return {
    client,
    project: {
      id: "project-1",
      worktree,
      time: { created: Date.now() },
    },
    directory: worktree,
    worktree,
    serverUrl: new URL("http://127.0.0.1:1"),
    $,
  };
}

function createSdkResult<T>(data: T) {
  return {
    data,
    error: undefined,
    request: new Request("http://127.0.0.1:1"),
    response: new Response(JSON.stringify(data)),
  };
}

function createMockRuntimeClient(promptTexts: string[]) {
  const createCalls: Array<{ body?: { title?: string } }> = [];
  const promptCalls: Array<{
    path: { id: string };
    body?: {
      system?: string;
      model?: { providerID: string; modelID: string };
      parts?: Array<{ type: string; text?: string }>;
    };
  }> = [];

  let promptIndex = 0;

  return {
    createCalls,
    promptCalls,
    client: {
      session: {
        async create(options: { body?: { title?: string } } = {}) {
          createCalls.push(options);
          const sessionID = `session-${createCalls.length}`;
          return createSdkResult({
            id: sessionID,
            projectID: "project-1",
            directory: "/tmp",
            title: options.body?.title ?? sessionID,
            version: "1",
            time: {
              created: Date.now(),
              updated: Date.now(),
            },
          });
        },
        async prompt(options: {
          path: { id: string };
          body?: {
            system?: string;
            model?: { providerID: string; modelID: string };
            parts?: Array<{ type: string; text?: string }>;
          };
        }) {
          promptCalls.push(options);
          promptIndex += 1;
          const text = promptTexts[promptIndex - 1] ?? JSON.stringify({});

          return createSdkResult({
            info: {
              id: `message-${promptIndex}`,
              sessionID: options.path.id,
              role: "assistant" as const,
              time: {
                created: Date.now(),
                completed: Date.now(),
              },
              parentID: `user-${promptIndex}`,
              modelID: options.body?.model?.modelID ?? "default-model",
              providerID: options.body?.model?.providerID ?? "default-provider",
              mode: "json",
              path: {
                cwd: "/tmp",
                root: "/tmp",
              },
              cost: 0,
              tokens: {
                input: 0,
                output: 0,
                reasoning: 0,
                cache: {
                  read: 0,
                  write: 0,
                },
              },
            },
            parts: [
              {
                id: `part-${promptIndex}`,
                sessionID: options.path.id,
                messageID: `message-${promptIndex}`,
                type: "text" as const,
                text,
              },
            ],
          });
        },
      },
    },
  };
}

function createToolContext(worktree: string): ToolContext {
  return {
    sessionID: "session-1",
    messageID: "message-1",
    agent: "test-agent",
    directory: worktree,
    worktree,
    abort: new AbortController().signal,
    metadata() {},
    async ask() {},
  };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const directory = tempDirs.pop();
    if (directory) {
      rmSync(directory, { recursive: true, force: true });
    }
  }
});

describe("TangDynastyPlugin", () => {
  test("tang_audit returns filtered concise audit data through the plugin tool surface", async () => {
    const worktree = createWorktree();
    const orchestrator = new TangDynastyOrchestrator({
      storagePath: join(worktree, ".tang-dynasty", "state.json"),
      enableParallelExecution: false,
    });

    await orchestrator.processRequest("Implement code and test the plugin");
    await orchestrator.processRequest("Build the plugin scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      {
        latest: true,
        ministry: "works",
      },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "[]")).toEqual([
      {
        edictId: expect.any(String),
        title: "Build the plugin scaffold",
        status: "completed",
        totalTasks: 1,
        clientExecutions: 0,
        localExecutions: 1,
        fallbackExecutions: 0,
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
          },
        ],
      },
    ]);
  });

  test("tang_audit passes edictId and limit filters through the plugin tool surface", async () => {
    const worktree = createWorktree();
    const orchestrator = new TangDynastyOrchestrator({
      storagePath: join(worktree, ".tang-dynasty", "state.json"),
      enableParallelExecution: false,
    });

    const first = await orchestrator.processRequest("Implement code and test the plugin");
    await orchestrator.processRequest("Build the plugin scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const toolContext = createToolContext(worktree);

    const limitedOutput = await plugin.tool?.tang_audit.execute(
      { limit: 1 },
      toolContext,
    );
    const edictOutput = await plugin.tool?.tang_audit.execute(
      { edictId: first.id },
      toolContext,
    );

    expect(JSON.parse(limitedOutput ?? "[]")).toHaveLength(1);
    expect(JSON.parse(edictOutput ?? "[]")).toEqual([
      {
        edictId: first.id,
        title: first.title,
        status: "completed",
        totalTasks: 4,
        clientExecutions: 0,
        localExecutions: 4,
        fallbackExecutions: 0,
        ministries: [
          {
            ministry: "military",
            status: "completed",
            executionSource: "local",
          },
          {
            ministry: "justice",
            status: "completed",
            executionSource: "local",
          },
          {
            ministry: "personnel",
            status: "completed",
            executionSource: "local",
          },
          {
            ministry: "revenue",
            status: "completed",
            executionSource: "local",
          },
        ],
      },
    ]);
  });

  test("tang_audit can return a fallback-only aggregate summary view", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask(edict) {
        if (edict.title.includes("fallback")) {
          return {
            status: "failed",
            error: "remote execution failed",
            raw: JSON.stringify({ source: "runtime-execution" }),
          };
        }

        return {
          status: "completed",
          result: "Remote execution completed works",
          raw: JSON.stringify({ source: "runtime-execution" }),
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("fallback scaffold");
    await orchestrator.processRequest("client scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const summaryArgs = {
      latest: false,
      fallbackOnly: true,
      view: "summary",
    };
    const output = await plugin.tool?.tang_audit.execute(summaryArgs, createToolContext(worktree));

    expect(JSON.parse(output ?? "{}")) .toEqual({
      totalEdicts: 1,
      totalTasks: 1,
      clientExecutions: 0,
      localExecutions: 1,
      fallbackExecutions: 1,
      ministries: [
        {
          ministry: "works",
          taskCount: 1,
          clientExecutions: 0,
          localExecutions: 1,
          fallbackExecutions: 1,
        },
      ],
    });
  });

  test("tang tools replay the successful clean-env regression fixture with stable summary and doctor outputs", async () => {
    const worktree = createWorktree();
    mkdirSync(join(worktree, ".tang-dynasty"), { recursive: true });
    writeFileSync(join(worktree, ".tang-dynasty", "state.json"), readFileSync(cleanRegressionStateFixture, "utf8"));

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const context = createToolContext(worktree);

    const status = JSON.parse(await plugin.tool?.tang_status.execute({}, context) ?? "{}");
    const edicts = JSON.parse(await plugin.tool?.tang_edicts.execute({}, context) ?? "[]");
    const summary = JSON.parse(await plugin.tool?.tang_audit.execute({ view: "summary", latest: true }, context) ?? "{}");
    const diagnostics = JSON.parse(await plugin.tool?.tang_audit.execute({ view: "diagnostics", latest: true }, context) ?? "[]");
    const health = JSON.parse(await plugin.tool?.tang_audit.execute({ view: "health" }, context) ?? "{}");
    const doctor = JSON.parse(await plugin.tool?.tang_doctor.execute({}, context) ?? "{}");

    expect(status).toMatchObject({
      phase: "idle",
      edictCount: 1,
      activeTaskCount: 0,
    });

    expect(edicts).toHaveLength(1);
    expect(edicts[0]).toMatchObject({
      status: "completed",
      title: expect.stringContaining("Release"),
    });

    expect(summary).toMatchObject({
      totalEdicts: 1,
      totalTasks: 3,
      clientExecutions: 3,
      localExecutions: 0,
      fallbackExecutions: 0,
    });
    expect(summary.ministries).toHaveLength(3);
    expect(summary.ministries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ taskCount: 1, clientExecutions: 1, localExecutions: 0, fallbackExecutions: 0 }),
        expect.objectContaining({ taskCount: 1, clientExecutions: 1, localExecutions: 0, fallbackExecutions: 0 }),
        expect.objectContaining({ taskCount: 1, clientExecutions: 1, localExecutions: 0, fallbackExecutions: 0 }),
      ]),
    );

    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]).toMatchObject({
      status: "completed",
      summary: {
        totalTasks: 3,
        clientExecutions: 3,
        localExecutions: 0,
        fallbackExecutions: 0,
      },
    });
    expect(diagnostics[0].ministries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          attemptCount: 2,
          reviewStatus: "approve",
          operatorNote: expect.stringContaining("2 execution attempts"),
        }),
      ]),
    );

    expect(health).toMatchObject({
      status: "ok",
      riskLevel: "low",
      score: 100,
    });
    expect(doctor).toMatchObject({
      status: "ok",
      riskLevel: "low",
      score: 100,
    });
  });

  test("tang_pipeline returns a flow-style snapshot with active tasks and recent events", async () => {
    const worktree = createWorktree();
    const now = Date.now();
    mkdirSync(join(worktree, ".tang-dynasty"), { recursive: true });
    writeFileSync(
      join(worktree, ".tang-dynasty", "state.json"),
      JSON.stringify(
        {
          edicts: [
            {
              id: "edict-1",
              title: "Build release artifact",
              description: "Build release artifact",
              status: "executing",
              origin: "zhongshu",
              messages: [
                {
                  role: "zhongshu",
                  content: JSON.stringify({
                    type: "plan",
                    tasks: [{ ministry: "works", description: "Build release artifact" }],
                  }),
                  timestamp: now - 4_000,
                },
                {
                  role: "menxia",
                  content: JSON.stringify({
                    verdict: "approve",
                    reasons: ["Looks good"],
                    amendments: [],
                  }),
                  timestamp: now - 3_000,
                },
                {
                  role: "shangshu",
                  content: "Dispatched to works: Build release artifact",
                  timestamp: now - 2_000,
                },
                {
                  role: "works",
                  content: "Starting: Build release artifact",
                  timestamp: now - 1_000,
                },
              ],
              createdAt: now - 5_000,
              updatedAt: now - 500,
            },
          ],
          activeTasks: [
            {
              id: "task-1",
              edictId: "edict-1",
              ministry: "works",
              description: "Build release artifact",
              status: "active",
              startedAt: now - 1_000,
            },
          ],
          tokenBudget: {
            total: 100_000,
            used: 1_200,
            perMinistry: {
              personnel: 0,
              revenue: 0,
              rites: 0,
              military: 0,
              justice: 0,
              works: 1_200,
            },
          },
          phase: "executing",
        },
        null,
        2,
      ),
    );

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const pipeline = JSON.parse(await plugin.tool?.tang_pipeline.execute({}, createToolContext(worktree)) ?? "{}");

    expect(pipeline).toMatchObject({
      currentPhase: "executing",
      currentStage: "executing",
      activeTaskCount: 1,
      latestEdict: {
        id: "edict-1",
        title: "Build release artifact",
        status: "executing",
      },
      flow: "[x] drafting -> [x] reviewing -> [x] dispatching -> [>] executing -> [ ] completing",
      activeTasks: [
        {
          id: "task-1",
          ministry: "works",
          description: "Build release artifact",
          status: "active",
        },
      ],
    });

    expect(pipeline.stages).toEqual([
      { phase: "drafting", label: "Drafting", chineseLabel: "中书省起草", status: "completed" },
      { phase: "reviewing", label: "Reviewing", chineseLabel: "门下省复核", status: "completed" },
      { phase: "dispatching", label: "Dispatching", chineseLabel: "尚书省派发", status: "completed" },
      { phase: "executing", label: "Executing", chineseLabel: "诸部执行", status: "active" },
      { phase: "completing", label: "Completing", chineseLabel: "结案归档", status: "pending" },
    ]);

    expect(pipeline.recentEvents).toEqual([
      expect.objectContaining({ role: "menxia", content: JSON.stringify({ verdict: "approve", reasons: ["Looks good"], amendments: [] }) }),
      expect.objectContaining({ role: "shangshu", content: "Dispatched to works: Build release artifact" }),
      expect.objectContaining({ role: "works", content: "Starting: Build release artifact" }),
    ]);
  });

  test("tang_audit can return a timeline view for the latest edict", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask(edict) {
        if (!edict.title.includes("fallback")) {
          return {
            status: "completed",
            result: "Remote execution completed works",
            raw: JSON.stringify({ source: "runtime-execution" }),
          };
        }

        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution" }),
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("fallback scaffold");
    await orchestrator.processRequest("client scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      {
        latest: true,
        fallbackOnly: true,
        view: "timeline",
      },
      createToolContext(worktree),
    );

    const timeline = JSON.parse(output ?? "[]");
    const events = timeline[0]?.events ?? [];

    expect(timeline).toHaveLength(1);
    expect(events.some((event: { role: string; content: string }) => event.role === "works" && event.content.startsWith("Starting:"))).toBe(true);
    expect(events.some((event: { source?: string; fallback?: string; role: string; content: string }) => event.role === "works" && event.content.startsWith("Failed:") && event.source === "client" && event.fallback === "local")).toBe(true);
    expect(events.some((event: { source?: string; fallbackFrom?: string; role: string; content: string }) => event.role === "works" && event.content.startsWith("Completed:") && event.source === "local" && event.fallbackFrom === "client")).toBe(true);
  });

  test("tang_audit can return an anomaly view for problematic edicts", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask(edict) {
        if (edict.title.includes("fallback")) {
          return {
            status: "failed",
            error: "remote execution failed",
            raw: JSON.stringify({ source: "runtime-execution" }),
          };
        }

        return {
          status: "completed",
          result: "Remote execution completed works",
          raw: JSON.stringify({ source: "runtime-execution" }),
        };
      },
    };

    const runtimeOrchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
        tokenBudgetLimit: 200,
      },
      undefined,
      runtime,
    );

    await runtimeOrchestrator.processRequest("fallback anomaly scaffold");

    const localOrchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
        tokenBudgetLimit: 200,
        maxReviewRounds: 1,
      },
    );

    await localOrchestrator.processRequest("Implement code");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      {
        view: "anomaly",
      },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "[]")).toEqual([
      {
        edictId: expect.any(String),
        title: "Implement code",
        status: "failed",
        reasons: [
          {
            type: "budget_blocked",
            detail: "Estimated work exceeds remaining token budget",
          },
        ],
      },
      {
        edictId: expect.any(String),
        title: "fallback anomaly scaffold",
        status: "completed",
        reasons: [
          {
            type: "fallback_heavy",
            detail: "1 ministry task used local fallback after client execution failed",
          },
        ],
      },
    ]);
  });

  test("tang_audit can return a diagnostics view without surfacing client raw payloads", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan() {
        return {
          title: "fallback diagnostics scaffold",
          description: "Remote execution fails and falls back locally",
          tasks: [{ ministry: "works", description: "Build the plugin scaffold" }],
          raw: JSON.stringify({ source: "runtime-plan" }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask() {
        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution", opaque: "keep-in-storage-only" }),
          sessionID: "session-exec-1",
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("fallback diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      {
        latest: true,
        view: "diagnostics",
      },
      createToolContext(worktree),
    );

    const diagnostics = JSON.parse(output ?? "[]");

    expect(diagnostics).toEqual([
      {
        edictId: expect.any(String),
        title: "fallback diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 1,
          clientExecutions: 0,
          localExecutions: 1,
          fallbackExecutions: 1,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed",
            clientSessionID: "session-exec-1",
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
        ],
      },
    ]);
    expect("clientRaw" in diagnostics[0].ministries[0]).toBe(false);
  });

  test("tang_audit anomaly view respects ministry filtering without leaking summary-less blocked edicts", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask() {
        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution" }),
        };
      },
    };

    const runtimeOrchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
        tokenBudgetLimit: 200,
      },
      undefined,
      runtime,
    );

    await runtimeOrchestrator.processRequest("fallback anomaly scaffold");

    const localOrchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
        tokenBudgetLimit: 200,
        maxReviewRounds: 1,
      },
    );

    await localOrchestrator.processRequest("Implement code");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      {
        view: "anomaly",
        ministry: "works",
      },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "[]")).toEqual([
      {
        edictId: expect.any(String),
        title: "fallback anomaly scaffold",
        status: "completed",
        reasons: [
          {
            type: "fallback_heavy",
            detail: "1 ministry task used local fallback after client execution failed",
          },
        ],
      },
    ]);
  });

  test("tang_audit can return anomaly hotspots view", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask() {
        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution" }),
        };
      },
    };

    const runtimeOrchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
        tokenBudgetLimit: 200,
      },
      undefined,
      runtime,
    );

    await runtimeOrchestrator.processRequest("fallback anomaly scaffold");

    const localOrchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
        tokenBudgetLimit: 200,
        maxReviewRounds: 1,
      },
    );

    await localOrchestrator.processRequest("Implement code");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      {
        view: "hotspots",
      },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "{}")) .toEqual({
      totalEdicts: 2,
      reasons: [
        { type: "budget_blocked", count: 1 },
        { type: "fallback_heavy", count: 1 },
      ],
      ministries: [
        { ministry: "military", count: 1 },
        { ministry: "works", count: 1 },
      ],
      recent: [
        {
          edictId: expect.any(String),
          title: "Implement code",
          status: "failed",
          reasons: [
            {
              type: "budget_blocked",
              detail: "Estimated work exceeds remaining token budget",
            },
          ],
        },
        {
          edictId: expect.any(String),
          title: "fallback anomaly scaffold",
          status: "completed",
          reasons: [
            {
              type: "fallback_heavy",
              detail: "1 ministry task used local fallback after client execution failed",
            },
          ],
        },
      ],
    });
  });

  test("tang_audit health view and tang_doctor return the same self-check report", async () => {
    const worktree = createWorktree();
    const orchestrator = new TangDynastyOrchestrator({
      storagePath: join(worktree, ".tang-dynasty", "state.json"),
      enableParallelExecution: false,
    });

    await orchestrator.processRequest("Build the plugin scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const context = createToolContext(worktree);
    const auditOutput = await plugin.tool?.tang_audit.execute(
      { view: "health" },
      context,
    );
    const doctorOutput = await plugin.tool?.tang_doctor.execute({}, context);

    expect(JSON.parse(auditOutput ?? "{}")) .toEqual(JSON.parse(doctorOutput ?? "{}"));
    expect(JSON.parse(doctorOutput ?? "{}")) .toMatchObject({
      status: "ok",
      riskLevel: "low",
      score: 100,
      riskPolicy: {
        scoreModel: "max(0, 100 - Σ(weight × priorityMultiplier))",
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
      prioritizedFindings: [],
      metrics: {
        edictCount: 1,
        activeTaskCount: 0,
        anomalyCount: 0,
      },
      checks: [
        { id: "storage", status: "ok", meaning: expect.any(String) },
        { id: "history", status: "ok", meaning: expect.any(String) },
        { id: "summary_integrity", status: "ok", meaning: expect.any(String) },
        { id: "active_tasks", status: "ok", meaning: expect.any(String) },
        { id: "anomalies", status: "ok", meaning: expect.any(String) },
        { id: "budget", status: "ok", meaning: expect.any(String) },
      ],
    });
  });

  test("tang_audit health view and tang_doctor surface corrupted persisted state", async () => {
    const worktree = createWorktree();
    const storagePath = join(worktree, ".tang-dynasty", "state.json");
    mkdirSync(join(worktree, ".tang-dynasty"), { recursive: true });
    writeFileSync(storagePath, "{ invalid json");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const context = createToolContext(worktree);
    const auditOutput = await plugin.tool?.tang_audit.execute(
      { view: "health" },
      context,
    );
    const doctorOutput = await plugin.tool?.tang_doctor.execute({}, context);
    const doctorReport = JSON.parse(doctorOutput ?? "{}");
    const storageCheck = doctorReport.checks.find((check: { id: string }) => check.id === "storage");

    expect(JSON.parse(auditOutput ?? "{}")).toEqual(doctorReport);
    expect(doctorReport.status).toBe("error");
    expect(doctorReport.riskLevel).toBe("critical");
    expect(doctorReport.score).toBe(26);
    expect(doctorReport.prioritizedFindings).toMatchObject([
      {
        checkId: "storage",
        priority: "critical",
        status: "error",
        summary: expect.stringContaining("corrupt"),
        weight: 6,
      },
      {
        checkId: "history",
        priority: "low",
        status: "warn",
        summary: expect.stringContaining("No persisted edicts"),
        weight: 1,
      },
    ]);
    expect(storageCheck).toMatchObject({
      id: "storage",
      status: "error",
      meaning: expect.any(String),
    });
    expect(storageCheck?.detail).toContain("corrupt");
  });


  test("tang_config returns a discoverable config inspection snapshot", async () => {
    const worktree = createWorktree();
    writeOpencodeConfig(worktree, ".");
    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const tangConfig = plugin.tool?.["tang_config"];

    expect(tangConfig).toBeDefined();

    const output = await tangConfig?.execute({}, createToolContext(worktree));

    expect(JSON.parse(output ?? "{}")).toEqual({
      summary: "Tang config explains where state lives, how runtime execution works, and which limits shape orchestration behavior.",
      status: "ok",
      warningCount: 0,
      warnings: [],
      configFile: {
        path: join(worktree, ".oh-my-tang.json"),
        source: "auto-generated",
        autoGenerated: true,
        foundOpencodeConfig: true,
        meaning: "Shows where Tang reads editable runtime settings and whether the config file had to be generated or recovered.",
      },
      storage: {
        path: join(worktree, ".tang-dynasty", "state.json"),
        status: "missing",
        meaning: "Shows whether persisted Tang state is available and where it lives.",
      },
      runtime: {
        mode: "client-with-local-fallback",
        meaning: "Shows whether Tang is using only local heuristics or OpenCode client sessions with fallback.",
      },
      limits: {
        maxConcurrentMinistries: 3,
        maxReviewRounds: 3,
        tokenBudgetLimit: 100000,
        meaning: "Shows the concurrency, review, and budget limits that shape Tang orchestration behavior.",
      },
      health: {
        riskProfile: "balanced",
        source: "default",
        meaning: "Shows which named health risk profile shapes doctor scores and risk levels.",
      },
      execution: {
        enableParallelExecution: true,
        verbose: false,
        meaning: "Shows execution-mode flags that affect how work runs and how much detail Tang emits.",
      },
      models: {
        agentModels: {},
        meaning: "Shows per-role OpenCode model overrides for Tang runtime agents, including any configured ministries; roles not listed use the host default model.",
      },
    });
  });

  test("auto-generates Tang config beside opencode.json during plugin initialization", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    const tangConfigPath = join(dirname(opencodeConfigPath), ".oh-my-tang.json");

    expect(() => readFileSync(tangConfigPath, "utf8")).toThrow();

    await TangDynastyPlugin(createPluginInput(worktree));

    expect(JSON.parse(readFileSync(tangConfigPath, "utf8"))).toEqual({
      maxConcurrentMinistries: 3,
      maxReviewRounds: 3,
      tokenBudgetLimit: 100000,
      healthRiskProfile: "balanced",
      enableParallelExecution: true,
      verbose: false,
      agentModels: {},
      departments: {
        zhongshu: {
          name: "Zhongshu",
          chineseName: "中书省",
          systemPrompt: "Draft a structured Tang edict plan with clear ministry tasks.",
        },
        menxia: {
          name: "Menxia",
          chineseName: "门下省",
          systemPrompt: "Review Tang plans and execution results for approval, rejection, and amendments.",
        },
        shangshu: {
          name: "Shangshu",
          chineseName: "尚书省",
          systemPrompt: "Dispatch approved Tang work to the correct ministries and summarize final outcomes.",
        },
      },
      ministries: [
        {
          id: "personnel",
          name: "Personnel",
          chineseName: "吏部",
          systemPrompt: "Coordinate ministry assignment and sequencing.",
          tools: ["planning", "delegation"],
        },
        {
          id: "revenue",
          name: "Revenue",
          chineseName: "户部",
          systemPrompt: "Track token budgets and resource estimates.",
          tools: ["budgeting", "estimation"],
        },
        {
          id: "rites",
          name: "Rites",
          chineseName: "礼部",
          systemPrompt: "Handle formatting, protocol, and style checks.",
          tools: ["formatting", "linting"],
        },
        {
          id: "military",
          name: "Military",
          chineseName: "兵部",
          systemPrompt: "Execute implementation-focused work.",
          tools: ["execution", "orchestration"],
        },
        {
          id: "justice",
          name: "Justice",
          chineseName: "刑部",
          systemPrompt: "Validate outputs, run checks, and enforce quality gates.",
          tools: ["validation", "testing"],
        },
        {
          id: "works",
          name: "Works",
          chineseName: "工部",
          systemPrompt: "Perform code, build, and file-generation work.",
          tools: ["coding", "builds"],
        },
      ],
    });
  });

  test("uses configured prompts and a configurable ministry list from .oh-my-tang.json", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");

    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        departments: {
          zhongshu: {
            systemPrompt: "Custom Zhongshu prompt.",
          },
          menxia: {
            systemPrompt: "Custom Menxia prompt.",
          },
          shangshu: {
            systemPrompt: "Custom Shangshu prompt.",
          },
        },
        ministries: [
          {
            id: "archives",
            name: "Archives",
            chineseName: "档案部",
            systemPrompt: "Archive every accepted task.",
            tools: ["archiving", "records"],
          },
        ],
      }, null, 2),
    );

    const mockClient = createMockRuntimeClient([
      JSON.stringify({
        title: "Archive the migration plan",
        description: "Archive the migration plan",
        tasks: [{ ministry: "archives", description: "Archive the migration plan" }],
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Looks good"],
        amendments: [],
      }),
      JSON.stringify({
        tasks: [{ ministry: "archives", description: "Archive the migration plan" }],
      }),
      JSON.stringify({
        status: "completed",
        result: "Archived the migration plan",
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Execution looks good"],
        amendments: [],
      }),
    ]);

    const plugin = await TangDynastyPlugin(createPluginInput(worktree, mockClient.client as PluginInput["client"]));
    const context = createToolContext(worktree);
    const agents = JSON.parse(await plugin.tool?.tang_agents.execute({}, context) ?? "{}");
    const output = await plugin.tool?.tang_process.execute(
      { request: "Archive the migration plan" },
      context,
    );
    const audit = JSON.parse(await plugin.tool?.tang_audit.execute(
      { latest: true },
      context,
    ) ?? "[]");
    const edict = JSON.parse(output ?? "{}");

    expect(agents.departments).toEqual([
      {
        id: "zhongshu",
        name: "Zhongshu",
        chineseName: "中书省",
        systemPrompt: "Custom Zhongshu prompt.",
      },
      {
        id: "menxia",
        name: "Menxia",
        chineseName: "门下省",
        systemPrompt: "Custom Menxia prompt.",
      },
      {
        id: "shangshu",
        name: "Shangshu",
        chineseName: "尚书省",
        systemPrompt: "Custom Shangshu prompt.",
      },
    ]);
    expect(agents.ministries).toEqual([
      {
        id: "archives",
        name: "Archives",
        chineseName: "档案部",
        systemPrompt: "Archive every accepted task.",
        tools: ["archiving", "records"],
      },
    ]);
    expect(edict.status).toBe("completed");
    expect(mockClient.promptCalls.map(call => call.body?.system)).toEqual([
      "Custom Zhongshu prompt.\nReturn JSON only.",
      "Custom Menxia prompt.\nReturn JSON only.",
      "Custom Shangshu prompt.\nReturn JSON only.",
      "Archive every accepted task.\nReturn JSON only.",
      "Custom Menxia prompt.\nReturn JSON only.",
    ]);
    expect(mockClient.promptCalls[0]?.body?.parts?.[0]?.text).toContain("Valid ministry ids: archives.");
    expect(audit).toMatchObject([
      {
        edictId: expect.any(String),
        title: "Archive the migration plan",
        status: "completed",
        totalTasks: 1,
        clientExecutions: 1,
        localExecutions: 0,
        fallbackExecutions: 0,
        ministries: [
          {
            ministry: "archives",
            status: "completed",
            executionSource: "client",
          },
        ],
      },
    ]);
  });

  test("supports model overrides for a custom configured ministry", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".");
    writeFileSync(join(dirname(opencodeConfigPath), ".oh-my-tang.json"), JSON.stringify({
      departments: {
        zhongshu: { systemPrompt: "CUSTOM DRAFT PROMPT" },
        menxia: { systemPrompt: "CUSTOM REVIEW PROMPT" },
        shangshu: { systemPrompt: "CUSTOM DISPATCH PROMPT" },
      },
      ministries: [
        {
          id: "archives",
          name: "Archives",
          chineseName: "档案部",
          systemPrompt: "CUSTOM ARCHIVES PROMPT",
          tools: ["documentation"],
        },
      ],
      agentModels: {
        archives: {
          providerID: "openai",
          modelID: "gpt-5-mini",
        },
      },
    }, null, 2));

    const mockClient = createMockRuntimeClient([
      JSON.stringify({
        title: "Prepare release notes",
        description: "Prepare release notes",
        tasks: [{ ministry: "archives", description: "Prepare release notes" }],
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Looks good"],
        amendments: [],
      }),
      JSON.stringify({
        tasks: [{ ministry: "archives", description: "Prepare release notes" }],
      }),
      JSON.stringify({
        status: "completed",
        result: "Prepared release notes",
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Execution looks good"],
        amendments: [],
      }),
    ]);

    const plugin = await TangDynastyPlugin(createPluginInput(worktree, mockClient.client as PluginInput["client"]));
    const output = await plugin.tool?.tang_process.execute(
      { request: "Prepare release notes" },
      createToolContext(worktree),
    );
    const edict = JSON.parse(output ?? "{}");

    expect(edict.status).toBe("completed");
    expect(mockClient.promptCalls.map((call) => call.body?.system)).toEqual([
      "CUSTOM DRAFT PROMPT\nReturn JSON only.",
      "CUSTOM REVIEW PROMPT\nReturn JSON only.",
      "CUSTOM DISPATCH PROMPT\nReturn JSON only.",
      "CUSTOM ARCHIVES PROMPT\nReturn JSON only.",
      "CUSTOM REVIEW PROMPT\nReturn JSON only.",
    ]);
    expect(mockClient.promptCalls[3]?.body?.model).toEqual({
      providerID: "openai",
      modelID: "gpt-5-mini",
    });
  });

  test("falls back to the remaining configured ministries when the default six ministries are reduced", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".");
    writeFileSync(join(dirname(opencodeConfigPath), ".oh-my-tang.json"), JSON.stringify({
      ministries: [
        {
          id: "works",
          name: "Works",
          chineseName: "工部",
          systemPrompt: "Perform code, build, and file-generation work.",
          tools: ["coding", "builds"],
        },
      ],
    }, null, 2));

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const context = createToolContext(worktree);
    const output = await plugin.tool?.tang_process.execute(
      { request: "Implement code and test the plugin" },
      context,
    );
    const audit = JSON.parse(await plugin.tool?.tang_audit.execute({ latest: true }, context) ?? "[]");
    const edict = JSON.parse(output ?? "{}");
    const summary = JSON.parse(edict.messages.at(-1)?.content ?? "{}");

    expect(edict.status).toBe("completed");
    expect(summary).toMatchObject({
      summary: {
        totalTasks: 1,
        completed: 1,
        failed: 0,
      },
      results: [
        expect.objectContaining({
          ministry: "works",
          status: "completed",
        }),
      ],
    });
    expect(audit).toMatchObject([
      {
        totalTasks: 1,
        ministries: [
          {
            ministry: "works",
            status: "completed",
          },
        ],
      },
    ]);
  });

  test("falls back to the worktree root when opencode.json is absent", async () => {
    const worktree = createWorktree();
    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const tangConfigPath = join(worktree, ".oh-my-tang.json");
    const config = JSON.parse(readFileSync(tangConfigPath, "utf8"));
    const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

    expect(config).toMatchObject({
      maxConcurrentMinistries: 3,
      enableParallelExecution: true,
    });
    expect(report.configFile).toEqual({
      path: tangConfigPath,
      source: "auto-generated",
      autoGenerated: true,
      foundOpencodeConfig: false,
      meaning: "Shows where Tang reads editable runtime settings and whether the config file had to be generated or recovered.",
    });
    expect(report.status).toBe("warn");
    expect(report.warningCount).toBe(1);
    expect(report.warnings).toContain("Could not find opencode.json under the current worktree; generated .oh-my-tang.json in the worktree root.");
  });

  test("loads overrides from .oh-my-tang.json", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        maxConcurrentMinistries: 2,
        maxReviewRounds: 5,
        tokenBudgetLimit: 250000,
        healthRiskProfile: "relaxed",
        enableParallelExecution: false,
        verbose: true,
      }, null, 2),
    );

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

    expect(report.limits).toMatchObject({
      maxConcurrentMinistries: 2,
      maxReviewRounds: 5,
      tokenBudgetLimit: 250000,
    });
    expect(report.execution).toMatchObject({
      enableParallelExecution: false,
      verbose: true,
    });
    expect(report.models).toEqual({
      agentModels: {},
      meaning: "Shows per-role OpenCode model overrides for Tang runtime agents, including any configured ministries; roles not listed use the host default model.",
    });
    expect(report.health).toMatchObject({
      riskProfile: "relaxed",
      source: "config",
    });
    expect(report.configFile).toMatchObject({
      path: join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      source: "file",
      autoGenerated: false,
      foundOpencodeConfig: true,
    });
  });

  test("prefers TANG_HEALTH_RISK_PROFILE over file config", async () => {
    const previous = process.env.TANG_HEALTH_RISK_PROFILE;
    process.env.TANG_HEALTH_RISK_PROFILE = "strict";

    try {
      const worktree = createWorktree();
      const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
      writeFileSync(
        join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
        JSON.stringify({ healthRiskProfile: "relaxed" }, null, 2),
      );

      const plugin = await TangDynastyPlugin(createPluginInput(worktree));
      const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

      expect(report.health).toMatchObject({
        riskProfile: "strict",
        source: "env",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.TANG_HEALTH_RISK_PROFILE;
      } else {
        process.env.TANG_HEALTH_RISK_PROFILE = previous;
      }
    }
  });

  test("surfaces a warning when .oh-my-tang.json contains invalid JSON", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    const tangConfigPath = join(dirname(opencodeConfigPath), ".oh-my-tang.json");
    writeFileSync(tangConfigPath, "{ invalid json");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

    expect(report.status).toBe("warn");
    expect(report.warningCount).toBe(1);
    expect(report.warnings[0]).toContain("Failed to parse .oh-my-tang.json");
    expect(report.configFile).toMatchObject({
      path: tangConfigPath,
      source: "invalid-file-fallback",
      autoGenerated: false,
      foundOpencodeConfig: true,
    });
    expect(report.execution.enableParallelExecution).toBe(true);
  });

  test("surfaces warnings and ignores invalid config fields", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        maxConcurrentMinistries: "many",
        enableParallelExecution: "yes",
        tokenBudgetLimit: 120000,
      }, null, 2),
    );

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

    expect(report.status).toBe("warn");
    expect(report.warningCount).toBe(2);
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Ignoring invalid ".oh-my-tang.json" value for "maxConcurrentMinistries".',
      'Ignoring invalid ".oh-my-tang.json" value for "enableParallelExecution".',
    ]));
    expect(report.limits).toMatchObject({
      maxConcurrentMinistries: 3,
      tokenBudgetLimit: 120000,
    });
    expect(report.execution).toMatchObject({
      enableParallelExecution: true,
    });
  });

  test("loads agentModels overrides from .oh-my-tang.json", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        agentModels: {
          zhongshu: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4-5",
          },
          shangshu: {
            providerID: "openai",
            modelID: "gpt-5-nano",
          },
          works: {
            providerID: "openai",
            modelID: "gpt-5",
          },
        },
      }, null, 2),
    );

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

    expect(report.status).toBe("ok");
    expect(report.warningCount).toBe(0);
    expect(report.models).toEqual({
      agentModels: {
        zhongshu: {
          providerID: "anthropic",
          modelID: "claude-sonnet-4-5",
        },
        shangshu: {
          providerID: "openai",
          modelID: "gpt-5-nano",
        },
        works: {
          providerID: "openai",
          modelID: "gpt-5",
        },
      },
      meaning: "Shows per-role OpenCode model overrides for Tang runtime agents, including any configured ministries; roles not listed use the host default model.",
    });
  });

  test("surfaces warnings and keeps valid entries when agentModels contains invalid values", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        agentModels: {
          grandCouncil: {
            providerID: "openai",
            modelID: "gpt-5",
          },
          zhongshu: {
            providerID: "anthropic",
          },
          works: {
            providerID: "openai",
            modelID: "gpt-5",
          },
        },
      }, null, 2),
    );

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const report = JSON.parse(await plugin.tool?.tang_config.execute({}, createToolContext(worktree)) ?? "{}");

    expect(report.status).toBe("warn");
    expect(report.warningCount).toBe(2);
    expect(report.warnings).toEqual(expect.arrayContaining([
      'Ignoring invalid ".oh-my-tang.json" value for "agentModels.grandCouncil".',
      'Ignoring invalid ".oh-my-tang.json" value for "agentModels.zhongshu".',
    ]));
    expect(report.models).toEqual({
      agentModels: {
        works: {
          providerID: "openai",
          modelID: "gpt-5",
        },
      },
      meaning: "Shows per-role OpenCode model overrides for Tang runtime agents, including any configured ministries; roles not listed use the host default model.",
    });
  });

  test("plugin can source a strict health risk profile from TANG_HEALTH_RISK_PROFILE", async () => {
    const previous = process.env.TANG_HEALTH_RISK_PROFILE;
    process.env.TANG_HEALTH_RISK_PROFILE = "strict";

    try {
      const worktree = createWorktree();
      writeOpencodeConfig(worktree, ".");
      const plugin = await TangDynastyPlugin(createPluginInput(worktree));
      const context = createToolContext(worktree);
      const configReport = JSON.parse(await plugin.tool?.tang_config.execute({}, context) ?? "{}");
      const doctorReport = JSON.parse(await plugin.tool?.tang_doctor.execute({}, context) ?? "{}");

      expect(configReport.health).toEqual({
        riskProfile: "strict",
        source: "env",
        meaning: "Shows which named health risk profile shapes doctor scores and risk levels.",
      });
      expect(configReport.status).toBe("ok");
      expect(configReport.warningCount).toBe(0);
      expect(configReport.warnings).toEqual([]);
      expect(doctorReport.riskPolicy.profile).toBe("strict");
      expect(doctorReport.riskPolicy.source).toBe("env");
      expect(doctorReport.riskPolicy.priorityMultipliers).toEqual({
        critical: 14,
        high: 6,
        medium: 5,
        low: 3,
      });
      expect(doctorReport.riskPolicy.riskLevelThresholds).toEqual({
        low: 95,
        medium: 80,
        high: 60,
        critical: 0,
      });
    } finally {
      if (previous === undefined) {
        delete process.env.TANG_HEALTH_RISK_PROFILE;
      } else {
        process.env.TANG_HEALTH_RISK_PROFILE = previous;
      }
    }
  });

  test("plugin surfaces a warning when TANG_HEALTH_RISK_PROFILE is invalid and falls back to balanced", async () => {
    const previous = process.env.TANG_HEALTH_RISK_PROFILE;
    process.env.TANG_HEALTH_RISK_PROFILE = "STRICT";

    try {
      const worktree = createWorktree();
      writeOpencodeConfig(worktree, ".");
      const plugin = await TangDynastyPlugin(createPluginInput(worktree));
      const context = createToolContext(worktree);
      const configReport = JSON.parse(await plugin.tool?.tang_config.execute({}, context) ?? "{}");
      const doctorReport = JSON.parse(await plugin.tool?.tang_doctor.execute({}, context) ?? "{}");

      expect(configReport.health).toEqual({
        riskProfile: "balanced",
        source: "env-invalid-fallback",
        warning: "Invalid TANG_HEALTH_RISK_PROFILE=\"STRICT\"; falling back to \"balanced\". Supported values: balanced, strict, relaxed.",
        meaning: "Shows which named health risk profile shapes doctor scores and risk levels.",
      });
      expect(configReport.status).toBe("warn");
      expect(configReport.warningCount).toBe(1);
      expect(configReport.warnings).toEqual([
        'Invalid TANG_HEALTH_RISK_PROFILE="STRICT"; falling back to "balanced". Supported values: balanced, strict, relaxed.',
      ]);
      expect(doctorReport.riskPolicy).toMatchObject({
        profile: "balanced",
        source: "env-invalid-fallback",
        warning: "Invalid TANG_HEALTH_RISK_PROFILE=\"STRICT\"; falling back to \"balanced\". Supported values: balanced, strict, relaxed.",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.TANG_HEALTH_RISK_PROFILE;
      } else {
        process.env.TANG_HEALTH_RISK_PROFILE = previous;
      }
    }
  });

  test("plugin treats an empty TANG_HEALTH_RISK_PROFILE as invalid and surfaces a warning", async () => {
    const previous = process.env.TANG_HEALTH_RISK_PROFILE;
    process.env.TANG_HEALTH_RISK_PROFILE = "";

    try {
      const worktree = createWorktree();
      writeOpencodeConfig(worktree, ".");
      const plugin = await TangDynastyPlugin(createPluginInput(worktree));
      const context = createToolContext(worktree);
      const configReport = JSON.parse(await plugin.tool?.tang_config.execute({}, context) ?? "{}");
      const doctorReport = JSON.parse(await plugin.tool?.tang_doctor.execute({}, context) ?? "{}");

      expect(configReport.health).toEqual({
        riskProfile: "balanced",
        source: "env-invalid-fallback",
        warning: "Invalid TANG_HEALTH_RISK_PROFILE=\"\"; falling back to \"balanced\". Supported values: balanced, strict, relaxed.",
        meaning: "Shows which named health risk profile shapes doctor scores and risk levels.",
      });
      expect(configReport.status).toBe("warn");
      expect(configReport.warningCount).toBe(1);
      expect(configReport.warnings).toEqual([
        'Invalid TANG_HEALTH_RISK_PROFILE=""; falling back to "balanced". Supported values: balanced, strict, relaxed.',
      ]);
      expect(doctorReport.riskPolicy).toMatchObject({
        profile: "balanced",
        source: "env-invalid-fallback",
        warning: "Invalid TANG_HEALTH_RISK_PROFILE=\"\"; falling back to \"balanced\". Supported values: balanced, strict, relaxed.",
      });
    } finally {
      if (previous === undefined) {
        delete process.env.TANG_HEALTH_RISK_PROFILE;
      } else {
        process.env.TANG_HEALTH_RISK_PROFILE = previous;
      }
    }
  });

  test("tang_doctor and tang_config expose operator-facing explanations", async () => {
    const worktree = createWorktree();
    const orchestrator = new TangDynastyOrchestrator({
      storagePath: join(worktree, ".tang-dynasty", "state.json"),
      enableParallelExecution: false,
    });

    await orchestrator.processRequest("Build the plugin scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const context = createToolContext(worktree);
    const doctorReport = JSON.parse(await plugin.tool?.tang_doctor.execute({}, context) ?? "{}");
    const configReport = JSON.parse(await plugin.tool?.tang_config.execute({}, context) ?? "{}");

    expect(typeof doctorReport.summary).toBe("string");
    expect(typeof doctorReport.checks.find((check: { id: string }) => check.id === "storage")?.meaning).toBe("string");
    expect(typeof configReport.summary).toBe("string");
    expect(typeof configReport.storage?.meaning).toBe("string");
    expect(typeof configReport.runtime?.meaning).toBe("string");
    expect(typeof configReport.models?.meaning).toBe("string");
  });

  test("runtime model override uses agentModels for zhongshu menxia and works", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        agentModels: {
          zhongshu: {
            providerID: "anthropic",
            modelID: "claude-sonnet-4-5",
          },
          menxia: {
            providerID: "openai",
            modelID: "gpt-5-mini",
          },
          shangshu: {
            providerID: "openai",
            modelID: "gpt-5-nano",
          },
          works: {
            providerID: "openai",
            modelID: "gpt-5",
          },
        },
      }, null, 2),
    );

    const mockClient = createMockRuntimeClient([
      JSON.stringify({
        title: "Build release artifact",
        description: "Build release artifact",
        tasks: [{ ministry: "works", description: "Build release artifact" }],
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Looks good"],
        amendments: [],
      }),
      JSON.stringify({
        tasks: [{ ministry: "works", description: "Build release artifact" }],
      }),
      JSON.stringify({
        status: "completed",
        result: "Built release artifact",
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Execution looks good"],
        amendments: [],
      }),
    ]);

    const plugin = await TangDynastyPlugin(createPluginInput(worktree, mockClient.client as PluginInput["client"]));
    const output = await plugin.tool?.tang_process.execute(
      { request: "Build release artifact" },
      createToolContext(worktree),
    );
    const edict = JSON.parse(output ?? "{}");
    const timelineOutput = await plugin.tool?.tang_audit.execute(
      { latest: true, view: "timeline" },
      createToolContext(worktree),
    );
    const timeline = JSON.parse(timelineOutput ?? "[]");
    const shangshuDispatch = timeline[0]?.events?.find((event: { role: string; content: string }) => (
      event.role === "shangshu" && event.content.startsWith("Dispatched to works:")
    ));
    const worksCompleted = timeline[0]?.events?.find((event: { role: string; content: string }) => (
      event.role === "works" && event.content.startsWith("Completed:")
    ));

    expect(edict.status).toBe("completed");
    expect(mockClient.promptCalls.map(call => call.body?.model)).toEqual([
      { providerID: "anthropic", modelID: "claude-sonnet-4-5" },
      { providerID: "openai", modelID: "gpt-5-mini" },
      { providerID: "openai", modelID: "gpt-5-nano" },
      { providerID: "openai", modelID: "gpt-5" },
      { providerID: "openai", modelID: "gpt-5-mini" },
    ]);
    expect(shangshuDispatch).toMatchObject({
      source: "client",
      providerID: "openai",
      modelID: "gpt-5-nano",
    });
    expect(worksCompleted).toMatchObject({
      source: "client",
      providerID: "openai",
      modelID: "gpt-5",
    });
  });

  test("runtime model override omits prompt-level model when a role has no override", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        agentModels: {
          works: {
            providerID: "openai",
            modelID: "gpt-5",
          },
        },
      }, null, 2),
    );

    const mockClient = createMockRuntimeClient([
      JSON.stringify({
        title: "Build release artifact",
        description: "Build release artifact",
        tasks: [{ ministry: "works", description: "Build release artifact" }],
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Looks good"],
        amendments: [],
      }),
      JSON.stringify({
        tasks: [{ ministry: "works", description: "Build release artifact" }],
      }),
      JSON.stringify({
        status: "completed",
        result: "Built release artifact",
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Execution looks good"],
        amendments: [],
      }),
    ]);

    const plugin = await TangDynastyPlugin(createPluginInput(worktree, mockClient.client as PluginInput["client"]));
    const output = await plugin.tool?.tang_process.execute(
      { request: "Build release artifact" },
      createToolContext(worktree),
    );
    const edict = JSON.parse(output ?? "{}");

    expect(edict.status).toBe("completed");
    expect(mockClient.promptCalls.map(call => call.body?.model)).toEqual([
      undefined,
      undefined,
      undefined,
      { providerID: "openai", modelID: "gpt-5" },
      undefined,
    ]);
  });

  test("shangshu dispatch fallback preserves client provenance in timeline", async () => {
    const worktree = createWorktree();
    const opencodeConfigPath = writeOpencodeConfig(worktree, ".opencode");
    writeFileSync(
      join(dirname(opencodeConfigPath), ".oh-my-tang.json"),
      JSON.stringify({
        agentModels: {
          shangshu: {
            providerID: "openai",
            modelID: "gpt-5-nano",
          },
        },
      }, null, 2),
    );

    const mockClient = createMockRuntimeClient([
      JSON.stringify({
        title: "Build release artifact",
        description: "Build release artifact",
        tasks: [{ ministry: "works", description: "Build release artifact" }],
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Looks good"],
        amendments: [],
      }),
      "not json",
      JSON.stringify({
        status: "completed",
        result: "Built release artifact",
      }),
      JSON.stringify({
        verdict: "approve",
        reasons: ["Execution looks good"],
        amendments: [],
      }),
    ]);

    const plugin = await TangDynastyPlugin(createPluginInput(worktree, mockClient.client as PluginInput["client"]));
    await plugin.tool?.tang_process.execute(
      { request: "Build release artifact" },
      createToolContext(worktree),
    );

    const timelineOutput = await plugin.tool?.tang_audit.execute(
      { latest: true, view: "timeline" },
      createToolContext(worktree),
    );
    const timeline = JSON.parse(timelineOutput ?? "[]");
    const dispatchEvent = timeline[0]?.events?.find((event: {
      role: string;
      content: string;
      source?: string;
      fallback?: string;
      fallbackFrom?: string;
      error?: string;
    }) => event.role === "shangshu" && event.content.startsWith("Dispatched to works:"));

    expect(dispatchEvent).toMatchObject({
      role: "shangshu",
      source: "local",
      fallbackFrom: "client",
      fallback: "local",
      error: expect.stringContaining("Invalid dispatch payload"),
      providerID: "openai",
      modelID: "gpt-5-nano",
    });
  });

  test("tang_audit diagnostics exposes provider and model for runtime execution", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
          sessionID: "draft-session-1",
          providerID: "cliproxy",
          modelID: "claude-sonnet-4-6",
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "review-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async executeTask() {
        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution" }),
          sessionID: "execution-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.3-codex",
        };
      },
      async reviewTaskExecution() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the local fallback"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "execution-review-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("fallback diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics" },
      createToolContext(worktree),
    );

    const diagnostics = JSON.parse(output ?? "[]");
    expect(diagnostics[0].ministries[0]).toMatchObject({
      ministry: "works",
      executionSource: "local",
      fallbackFrom: "client",
      clientProviderID: "cliproxy",
      clientModelID: "gpt-5.3-codex",
    });
  });

  test("works retries runtime execution once before succeeding", async () => {
    const worktree = createWorktree();
    let executionAttempt = 0;
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
          sessionID: "draft-session-1",
          providerID: "cliproxy",
          modelID: "claude-sonnet-4-6",
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "review-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async dispatchTasks(_edict, planContent: string) {
        return {
          tasks: JSON.parse(planContent).tasks,
          raw: JSON.stringify({ source: "runtime-dispatch" }),
          sessionID: "dispatch-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async executeTask() {
        executionAttempt += 1;

        if (executionAttempt === 1) {
          return {
            status: "failed",
            error: "first runtime failure",
            raw: JSON.stringify({ source: "runtime-execution", attempt: executionAttempt }),
            sessionID: `execution-session-${executionAttempt}`,
            providerID: "cliproxy",
            modelID: "gpt-5.4",
          };
        }

        return {
          status: "completed",
          result: "Remote execution succeeded on retry",
          raw: JSON.stringify({ source: "runtime-execution", attempt: executionAttempt }),
          sessionID: `execution-session-${executionAttempt}`,
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async reviewTaskExecution() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "execution-review-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("works retry success scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics", latest: true },
      createToolContext(worktree),
    );

    const diagnostics = JSON.parse(output ?? "[]");
    expect(executionAttempt).toBe(2);
    expect(diagnostics[0].ministries[0]).toMatchObject({
      ministry: "works",
      status: "completed",
      executionSource: "client",
      clientProviderID: "cliproxy",
      clientModelID: "gpt-5.4",
      clientAttemptCount: 2,
      operatorNote: "Completed through OpenCode client execution after 2 runtime attempts.",
    });
  });

  test("works falls back locally after two runtime execution failures", async () => {
    const worktree = createWorktree();
    let executionAttempt = 0;
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
          sessionID: "draft-session-1",
          providerID: "cliproxy",
          modelID: "claude-sonnet-4-6",
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "review-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async dispatchTasks(_edict, planContent: string) {
        return {
          tasks: JSON.parse(planContent).tasks,
          raw: JSON.stringify({ source: "runtime-dispatch" }),
          sessionID: "dispatch-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async executeTask() {
        executionAttempt += 1;
        return {
          status: "failed",
          error: `runtime failure ${executionAttempt}`,
          raw: JSON.stringify({ source: "runtime-execution", attempt: executionAttempt }),
          sessionID: `execution-session-${executionAttempt}`,
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
      async reviewTaskExecution() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the local fallback"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "execution-review-session-1",
          providerID: "cliproxy",
          modelID: "gpt-5.4",
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("works retry fallback scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics", latest: true },
      createToolContext(worktree),
    );

    const diagnostics = JSON.parse(output ?? "[]");
    expect(executionAttempt).toBe(2);
    expect(diagnostics[0].ministries[0]).toMatchObject({
      ministry: "works",
      status: "completed",
      executionSource: "local",
      fallbackFrom: "client",
      clientProviderID: "cliproxy",
      clientModelID: "gpt-5.4",
      clientAttemptCount: 2,
      operatorNote: "Completed locally after 2 OpenCode client execution failures.",
    });
  });

  test("tang_audit can return a diagnostics view over persisted provenance", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
          sessionID: "draft-session-1",
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "review-session-1",
        };
      },
      async executeTask() {
        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution" }),
          sessionID: "execution-session-1",
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("fallback diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics" },
      createToolContext(worktree),
    );

    const diagnostics = JSON.parse(output ?? "[]");
    expect(diagnostics).toEqual([
      {
        edictId: expect.any(String),
        title: "fallback diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 1,
          clientExecutions: 0,
          localExecutions: 1,
          fallbackExecutions: 1,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed",
            clientSessionID: "execution-session-1",
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
        ],
      },
    ]);
    expect("clientRaw" in diagnostics[0].ministries[0]).toBe(false);
  });

  test("tang_audit diagnostics can include raw payloads when explicitly requested", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [{ ministry: "works", description: request }],
          raw: JSON.stringify({ source: "runtime-plan" }),
          sessionID: "draft-session-1",
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
          sessionID: "review-session-1",
        };
      },
      async executeTask() {
        return {
          status: "failed",
          error: "remote execution failed",
          raw: JSON.stringify({ source: "runtime-execution", trace: "raw-debug" }),
          sessionID: "execution-session-1",
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    await orchestrator.processRequest("fallback diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics", includeRaw: true },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "[]")).toEqual([
      {
        edictId: expect.any(String),
        title: "fallback diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 1,
          clientExecutions: 0,
          localExecutions: 1,
          fallbackExecutions: 1,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed",
            clientSessionID: "execution-session-1",
            clientRaw: JSON.stringify({ source: "runtime-execution", trace: "raw-debug" }),
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
        ],
      },
    ]);
  });

  test("tang_audit can scope raw drill-down to rawEdictId and rawMinistry while keeping the rest compact", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [
            { ministry: "works", description: `${request} works` },
            { ministry: "rites", description: `${request} rites` },
          ],
          raw: JSON.stringify({ source: "runtime-plan", request }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask(edict, task) {
        return {
          status: "failed",
          error: `remote execution failed for ${task.ministry}`,
          raw: JSON.stringify({ source: "runtime-execution", edict: edict.title, ministry: task.ministry }),
          sessionID: `${edict.title}-${task.ministry}`,
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    const first = await orchestrator.processRequest("first diagnostics scaffold");
    await orchestrator.processRequest("second diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics", includeRaw: true, rawEdictId: first.id, rawMinistry: "works" },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "[]")).toEqual([
      {
        edictId: first.id,
        title: "first diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 2,
          clientExecutions: 0,
          localExecutions: 2,
          fallbackExecutions: 2,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed for works",
            clientSessionID: "first diagnostics scaffold-works",
            clientRaw: JSON.stringify({ source: "runtime-execution", edict: "first diagnostics scaffold", ministry: "works" }),
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
          {
            ministry: "rites",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 1,
            clientError: "remote execution failed for rites",
            clientSessionID: "first diagnostics scaffold-rites",
            operatorNote: "Completed locally after OpenCode client execution failed.",
          },
        ],
      },
      {
        edictId: expect.any(String),
        title: "second diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 2,
          clientExecutions: 0,
          localExecutions: 2,
          fallbackExecutions: 2,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed for works",
            clientSessionID: "second diagnostics scaffold-works",
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
          {
            ministry: "rites",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 1,
            clientError: "remote execution failed for rites",
            clientSessionID: "second diagnostics scaffold-rites",
            operatorNote: "Completed locally after OpenCode client execution failed.",
          },
        ],
      },
    ]);
  });

  test("tang_audit can scope raw drill-down to a specific edict and ministry without changing the broader diagnostics result", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [
            { ministry: "works", description: `${request} works` },
            { ministry: "rites", description: `${request} rites` },
          ],
          raw: JSON.stringify({ source: "runtime-plan", request }),
        };
      },
      async reviewPlan() {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review" }),
        };
      },
      async executeTask(edict, task) {
        return {
          status: "failed",
          error: `remote execution failed for ${task.ministry}`,
          raw: JSON.stringify({ source: "runtime-execution", edict: edict.title, ministry: task.ministry }),
          sessionID: `${edict.title}-${task.ministry}`,
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    const first = await orchestrator.processRequest("first diagnostics scaffold");
    await orchestrator.processRequest("second diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const output = await plugin.tool?.tang_audit.execute(
      { view: "diagnostics", includeRaw: true, rawEdictId: first.id, rawMinistry: "works" },
      createToolContext(worktree),
    );

    expect(JSON.parse(output ?? "[]")).toEqual([
      {
        edictId: first.id,
        title: "first diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 2,
          clientExecutions: 0,
          localExecutions: 2,
          fallbackExecutions: 2,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed for works",
            clientSessionID: "first diagnostics scaffold-works",
            clientRaw: JSON.stringify({ source: "runtime-execution", edict: "first diagnostics scaffold", ministry: "works" }),
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
          {
            ministry: "rites",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 1,
            clientError: "remote execution failed for rites",
            clientSessionID: "first diagnostics scaffold-rites",
            operatorNote: "Completed locally after OpenCode client execution failed.",
          },
        ],
      },
      {
        edictId: expect.any(String),
        title: "second diagnostics scaffold",
        status: "completed",
        summary: {
          totalTasks: 2,
          clientExecutions: 0,
          localExecutions: 2,
          fallbackExecutions: 2,
        },
        ministries: [
          {
            ministry: "works",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 2,
            clientError: "remote execution failed for works",
            clientSessionID: "second diagnostics scaffold-works",
            operatorNote: "Completed locally after 2 OpenCode client execution failures.",
          },
          {
            ministry: "rites",
            status: "completed",
            executionSource: "local",
            fallbackFrom: "client",
            clientAttemptCount: 1,
            clientError: "remote execution failed for rites",
            clientSessionID: "second diagnostics scaffold-rites",
            operatorNote: "Completed locally after OpenCode client execution failed.",
          },
        ],
      },
    ]);
  });

  test("tang_audit diagnostics can drill raw payloads down to a selected edict and ministry", async () => {
    const worktree = createWorktree();
    const runtime: TangExecutionRuntime = {
      async draftPlan(_edict, request: string) {
        return {
          title: request,
          description: request,
          tasks: [
            { ministry: "works", description: `${request} works` },
            { ministry: "rites", description: `${request} rites` },
          ],
          raw: JSON.stringify({ source: "runtime-plan", request }),
          sessionID: `draft-${request}`,
        };
      },
      async reviewPlan(_edict, planContent: string) {
        return {
          verdict: "approve",
          amendments: [],
          reasons: ["Remote review approved the work"],
          raw: JSON.stringify({ source: "runtime-review", planContent }),
          sessionID: "review-session",
        };
      },
      async executeTask(edict, task) {
        return {
          status: "failed",
          error: `${task.ministry} failed remotely`,
          raw: JSON.stringify({ source: "runtime-execution", edictId: edict.id, ministry: task.ministry }),
          sessionID: `${edict.id}-${task.ministry}`,
        };
      },
    };

    const orchestrator = new TangDynastyOrchestrator(
      {
        storagePath: join(worktree, ".tang-dynasty", "state.json"),
        enableParallelExecution: false,
      },
      undefined,
      runtime,
    );

    const first = await orchestrator.processRequest("first diagnostics scaffold");
    await orchestrator.processRequest("second diagnostics scaffold");

    const plugin = await TangDynastyPlugin(createPluginInput(worktree));
    const diagnostics = JSON.parse(await plugin.tool?.tang_audit.execute(
      {
        view: "diagnostics",
        includeRaw: true,
        rawEdictId: first.id,
        rawMinistry: "works",
      },
      createToolContext(worktree),
    ) ?? "[]");

    const firstEdict = diagnostics.find((entry: { edictId: string }) => entry.edictId === first.id);
    const worksEntry = firstEdict.ministries.find((entry: { ministry: string }) => entry.ministry === "works");
    const ritesEntry = firstEdict.ministries.find((entry: { ministry: string }) => entry.ministry === "rites");
    const secondEdict = diagnostics.find((entry: { edictId: string }) => entry.edictId !== first.id);

    expect(worksEntry.clientRaw).toBe(JSON.stringify({ source: "runtime-execution", edictId: first.id, ministry: "works" }));
    expect("clientRaw" in ritesEntry).toBe(false);
    expect(secondEdict.ministries.every((entry: { clientRaw?: string }) => !("clientRaw" in entry))).toBe(true);
  });
});
