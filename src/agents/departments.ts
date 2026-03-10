import type { DepartmentConfig, DepartmentId, ResolvedDepartmentConfigMap } from "../types.js";

const DEFAULT_DEPARTMENT_ENTRIES: readonly DepartmentConfig[] = [
  {
    id: "zhongshu",
    name: "Zhongshu",
    chineseName: "中书省",
    systemPrompt: "Draft a structured Tang edict plan with clear ministry tasks.",
  },
  {
    id: "menxia",
    name: "Menxia",
    chineseName: "门下省",
    systemPrompt: "Review Tang plans and execution results for approval, rejection, and amendments.",
  },
  {
    id: "shangshu",
    name: "Shangshu",
    chineseName: "尚书省",
    systemPrompt: "Dispatch approved Tang work to the correct ministries and summarize final outcomes.",
  },
] as const;

export function createDepartmentMap(
  departments: readonly DepartmentConfig[] = DEFAULT_DEPARTMENT_ENTRIES,
): ResolvedDepartmentConfigMap {
  return departments.reduce((resolved, department) => {
    resolved[department.id] = { ...department };
    return resolved;
  }, {} as ResolvedDepartmentConfigMap);
}

export function cloneDepartmentMap(
  departments: ResolvedDepartmentConfigMap = createDepartmentMap(),
): ResolvedDepartmentConfigMap {
  return createDepartmentMap(Object.values(departments));
}

export function getDepartmentIds(): DepartmentId[] {
  return DEFAULT_DEPARTMENT_ENTRIES.map((department) => department.id);
}

export function resolveDepartmentCatalog(
  overrides: Partial<Record<DepartmentId, {
    name?: string;
    chineseName?: string;
    systemPrompt?: string;
  }>> = {},
): ResolvedDepartmentConfigMap {
  return getDepartmentIds().reduce((resolved, departmentId) => {
    const base = DEPARTMENTS[departmentId];
    const override = overrides[departmentId];
    resolved[departmentId] = {
      ...base,
      ...(override?.name ? { name: override.name } : {}),
      ...(override?.chineseName ? { chineseName: override.chineseName } : {}),
      ...(override?.systemPrompt ? { systemPrompt: override.systemPrompt } : {}),
    };
    return resolved;
  }, {} as ResolvedDepartmentConfigMap);
}

export const DEPARTMENTS = createDepartmentMap();
export const DEFAULT_DEPARTMENTS = DEPARTMENTS;
