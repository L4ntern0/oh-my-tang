import type {
  MinistryConfig,
  MinistryConfigInput,
  ResolvedMinistryConfigMap,
} from "../types.js";

const DEFAULT_MINISTRY_ENTRIES: readonly MinistryConfig[] = [
  {
    id: "personnel",
    name: "Personnel",
    chineseName: "吏部",
    department: "shangshu",
    systemPrompt: "Coordinate ministry assignment and sequencing.",
    tools: ["planning", "delegation"],
  },
  {
    id: "revenue",
    name: "Revenue",
    chineseName: "户部",
    department: "shangshu",
    systemPrompt: "Track token budgets and resource estimates.",
    tools: ["budgeting", "estimation"],
  },
  {
    id: "rites",
    name: "Rites",
    chineseName: "礼部",
    department: "shangshu",
    systemPrompt: "Handle formatting, protocol, and style checks.",
    tools: ["formatting", "linting"],
  },
  {
    id: "military",
    name: "Military",
    chineseName: "兵部",
    department: "shangshu",
    systemPrompt: "Execute implementation-focused work.",
    tools: ["execution", "orchestration"],
  },
  {
    id: "justice",
    name: "Justice",
    chineseName: "刑部",
    department: "shangshu",
    systemPrompt: "Validate outputs, run checks, and enforce quality gates.",
    tools: ["validation", "testing"],
  },
  {
    id: "works",
    name: "Works",
    chineseName: "工部",
    department: "shangshu",
    systemPrompt: "Perform code, build, and file-generation work.",
    tools: ["coding", "builds"],
  },
] as const;

export function createMinistryMap(
  ministries: readonly MinistryConfig[] = DEFAULT_MINISTRY_ENTRIES,
): ResolvedMinistryConfigMap {
  return ministries.reduce((resolved, ministry) => {
    resolved[ministry.id] = {
      ...ministry,
      tools: [...ministry.tools],
    };
    return resolved;
  }, {} as ResolvedMinistryConfigMap);
}

export function cloneMinistryMap(
  ministries: ResolvedMinistryConfigMap = createMinistryMap(),
): ResolvedMinistryConfigMap {
  return createMinistryMap(Object.values(ministries));
}

export function createMinistryInputs(
  ministries: readonly MinistryConfig[] = DEFAULT_MINISTRY_ENTRIES,
): MinistryConfigInput[] {
  return ministries.map((ministry) => ({
    id: ministry.id,
    name: ministry.name,
    chineseName: ministry.chineseName,
    systemPrompt: ministry.systemPrompt,
    tools: [...ministry.tools],
  }));
}

export function createDefaultMinistryInputs(): MinistryConfigInput[] {
  return createMinistryInputs();
}

export function resolveMinistryCatalog(
  ministries: readonly MinistryConfigInput[] = createDefaultMinistryInputs(),
): ResolvedMinistryConfigMap {
  return createMinistryMap(ministries.map((ministry) => ({
    ...ministry,
    department: "shangshu" as const,
    tools: [...ministry.tools],
  })));
}

export const MINISTRIES = createMinistryMap();
export const DEFAULT_MINISTRIES = MINISTRIES;
