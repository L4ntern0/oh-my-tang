# Changelog

All notable changes to this project will be documented in this file.

The format is inspired by [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project uses semantic version tags.

## [Unreleased]

## [0.1.1] - 2026-03-09

### Added

- Auto-generated `.oh-my-tang.json` support for packaged plugin usage, with file discovery beside `opencode.json` and worktree-root fallback when `opencode.json` is missing
- Config resolution precedence of built-in defaults, `.oh-my-tang.json`, then environment overrides
- `tang_config.configFile` metadata so operators can inspect the active config path, generation source, and `opencode.json` discovery result

### Changed

- `tang_config` now surfaces warnings for missing `opencode.json`, invalid `.oh-my-tang.json` JSON, and invalid config field values
- Editable plugin defaults are now centralized instead of being duplicated across runtime setup paths
- The default `ci` / `typecheck` scripts now match the files that actually exist in the public repository snapshot

### Documentation

- Documented `.oh-my-tang.json` auto-generation, location, precedence, and warning behavior in the Chinese and English READMEs
- Aligned development and release-check docs with the current repository snapshot by removing stale references to a missing live clean-env harness

## [0.1.0] - 2026-03-09

### Added

- Initial public release of `oh-my-tang-dynasty` as an OpenCode plugin package
- 三省六部 orchestration flow with Zhongshu drafting, Menxia review, Shangshu dispatch, and Six Ministries execution
- Operator-facing inspection tools including `tang_status`, `tang_pipeline`, `tang_edicts`, `tang_audit`, `tang_doctor`, `tang_config`, and `tang_reset`
- Runtime-backed execution with deterministic local fallback when OpenCode sessions fail or return unusable structured output
- Deterministic default regression coverage plus an opt-in live clean-env OpenCode regression path
- Minimal release-facing repository metadata, policy files, and CI verification

### Documentation

- Chinese-first default README plus dedicated Chinese and English companion READMEs
- Contribution, security, conduct, and release support documents for the initial public repository
