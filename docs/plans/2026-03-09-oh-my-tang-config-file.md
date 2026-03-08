# Tang Config File Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `.oh-my-tang.json` discovery, auto-generation, loading, validation, and reporting so Tang runtime settings can be configured beside `opencode.json`.

**Architecture:** Introduce a focused config helper that resolves the config directory, creates the default file when missing, validates parsed JSON, and returns both the merged plugin config and operator-facing metadata. Keep `src/plugin.ts` thin by delegating config-file concerns to the helper and extending `tang_config` output with source and warning details.

**Tech Stack:** TypeScript, Bun test, Node.js `fs`/`path`, existing Tang plugin/orchestrator types

---

### Task 1: Add failing tests for config file generation and loading

**Files:**
- Modify: `src/plugin.test.ts`
- Test: `src/plugin.test.ts`

**Step 1: Write the failing test**

Add focused tests that assert:

- plugin initialization creates `.oh-my-tang.json` beside `opencode.json`
- plugin initialization falls back to the worktree root when `opencode.json` is absent
- valid `.oh-my-tang.json` overrides defaults
- invalid JSON and invalid field values surface warnings without crashing

**Step 2: Run test to verify it fails**

Run: `bun test src/plugin.test.ts -t 'auto-generates Tang config beside opencode.json'`
Expected: FAIL because config-file support does not exist yet

**Step 3: Write minimal implementation**

Do not implement yet; this task ends after the failing tests are in place.

**Step 4: Run test to verify it still fails for the right reason**

Run: `bun test src/plugin.test.ts -t 'auto-generates Tang config beside opencode.json'`
Expected: FAIL due to missing config-file behavior, not due to test typos

**Step 5: Commit**

```bash
git add src/plugin.test.ts
git commit -m "test: cover Tang config file resolution"
```

### Task 2: Add config resolution helper

**Files:**
- Create: `src/config.ts`
- Modify: `src/types.ts`

**Step 1: Write the failing test**

Use the tests from Task 1 as the red state for config generation, fallback path resolution, and validation warnings.

**Step 2: Run test to verify it fails**

Run: `bun test src/plugin.test.ts -t 'auto-generates Tang config beside opencode.json'`
Expected: FAIL because the helper does not exist yet

**Step 3: Write minimal implementation**

Add a helper that:

- finds `opencode.json` under the active worktree
- decides the `.oh-my-tang.json` path
- writes the default file when missing
- loads and validates supported fields
- returns merged config plus metadata and warnings

Extend types so `TangConfigReport` can expose config-file metadata.

**Step 4: Run test to verify it passes**

Run: `bun test src/plugin.test.ts -t 'auto-generates Tang config beside opencode.json'`
Expected: PASS

**Step 5: Commit**

```bash
git add src/config.ts src/types.ts src/plugin.test.ts
git commit -m "feat: add Tang config file resolver"
```

### Task 3: Wire plugin initialization to config resolution

**Files:**
- Modify: `src/plugin.ts`

**Step 1: Write the failing test**

Use the existing new tests as the red state for plugin integration.

**Step 2: Run test to verify it fails**

Run: `bun test src/plugin.test.ts -t 'loads overrides from .oh-my-tang.json'`
Expected: FAIL because the plugin still uses hard-coded values

**Step 3: Write minimal implementation**

Replace hard-coded plugin config assembly with config-helper output while preserving the existing environment override for `healthRiskProfile`.

**Step 4: Run test to verify it passes**

Run: `bun test src/plugin.test.ts -t 'loads overrides from .oh-my-tang.json'`
Expected: PASS

**Step 5: Commit**

```bash
git add src/plugin.ts
git commit -m "feat: load Tang plugin config from file"
```

### Task 4: Surface config metadata through `tang_config`

**Files:**
- Modify: `src/orchestrator.ts`
- Modify: `src/types.ts`
- Modify: `src/plugin.test.ts`

**Step 1: Write the failing test**

Add assertions that `tang_config` reports:

- config file path
- whether it was auto-generated
- whether `opencode.json` was found
- warnings for fallback path / invalid file content

**Step 2: Run test to verify it fails**

Run: `bun test src/plugin.test.ts -t 'tang_config reports Tang config file metadata'`
Expected: FAIL because report fields do not exist yet

**Step 3: Write minimal implementation**

Extend config reporting so operators can inspect file location, warnings, and source details without opening the filesystem manually.

**Step 4: Run test to verify it passes**

Run: `bun test src/plugin.test.ts -t 'tang_config reports Tang config file metadata'`
Expected: PASS

**Step 5: Commit**

```bash
git add src/orchestrator.ts src/types.ts src/plugin.test.ts
git commit -m "feat: expose Tang config file metadata"
```

### Task 5: Run focused verification

**Files:**
- Modify: `src/plugin.test.ts` if fixes are needed

**Step 1: Write the failing test**

No new tests; use the added regression tests as the verification target.

**Step 2: Run test to verify it fails**

If a scoped test still fails unexpectedly, capture the exact failure and fix only the relevant implementation.

**Step 3: Write minimal implementation**

Apply only the smallest fixes required for the new config flow.

**Step 4: Run test to verify it passes**

Run: `bun test src/plugin.test.ts -t 'Tang config'`
Expected: PASS for the new config-file coverage

**Step 5: Commit**

```bash
git add src/plugin.test.ts src/config.ts src/plugin.ts src/orchestrator.ts src/types.ts
git commit -m "test: verify Tang config file support"
```
