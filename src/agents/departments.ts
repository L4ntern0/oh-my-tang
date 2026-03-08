import type { DepartmentConfig } from "../types.js";

export const DEPARTMENTS: Record<DepartmentConfig["id"], DepartmentConfig> = {
  zhongshu: {
    id: "zhongshu",
    name: "Zhongshu",
    chineseName: "中书省",
    systemPrompt: "Draft a structured Tang edict plan with clear ministry tasks.",
  },
  menxia: {
    id: "menxia",
    name: "Menxia",
    chineseName: "门下省",
    systemPrompt: "Review Tang plans and execution results for approval, rejection, and amendments.",
  },
  shangshu: {
    id: "shangshu",
    name: "Shangshu",
    chineseName: "尚书省",
    systemPrompt: "Dispatch approved Tang work to the correct ministries and summarize final outcomes.",
  },
};
