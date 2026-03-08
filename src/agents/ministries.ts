import type { MinistryConfig } from "../types.js";

export const MINISTRIES: Record<MinistryConfig["id"], MinistryConfig> = {
  personnel: {
    id: "personnel",
    name: "Personnel",
    chineseName: "吏部",
    department: "shangshu",
    systemPrompt: "Coordinate ministry assignment and sequencing.",
    tools: ["planning", "delegation"],
  },
  revenue: {
    id: "revenue",
    name: "Revenue",
    chineseName: "户部",
    department: "shangshu",
    systemPrompt: "Track token budgets and resource estimates.",
    tools: ["budgeting", "estimation"],
  },
  rites: {
    id: "rites",
    name: "Rites",
    chineseName: "礼部",
    department: "shangshu",
    systemPrompt: "Handle formatting, protocol, and style checks.",
    tools: ["formatting", "linting"],
  },
  military: {
    id: "military",
    name: "Military",
    chineseName: "兵部",
    department: "shangshu",
    systemPrompt: "Execute implementation-focused work.",
    tools: ["execution", "orchestration"],
  },
  justice: {
    id: "justice",
    name: "Justice",
    chineseName: "刑部",
    department: "shangshu",
    systemPrompt: "Validate outputs, run checks, and enforce quality gates.",
    tools: ["validation", "testing"],
  },
  works: {
    id: "works",
    name: "Works",
    chineseName: "工部",
    department: "shangshu",
    systemPrompt: "Perform code, build, and file-generation work.",
    tools: ["coding", "builds"],
  },
};
