# Nexio IDE

Nexio IDE is a multi-platform AI coding workspace built around an Electron shell, a React-based UI, a local orchestration backend, and a plugin-driven agent architecture.

## Project structure

```text
.
├── README.md
├── roadmap.md
├── copilot_instructions.md
├── ui_design.md
├── examples/
├── src/
│   ├── agents/
│   ├── backend/
│   │   └── llm/
│   ├── electron/
│   ├── plugins/
│   └── ui/
├── tests/
│   ├── e2e/
│   └── unit/
└── ...
```

## Architecture goals

- Electron application shell for desktop integration.
- React + Monaco UI for editing and workflow panels.
- Local backend orchestration for sandbox execution and agent coordination.
- LLM layer for prompt management, model connectors, and fallback logic.
- Plugin-based agent system for ideas, planning, and execution.
- Example workflows and tests to validate behavior and automation.

## Key areas

- src/electron: main process, browser window management, and IPC handlers.
- src/ui: React views, editor integration, and UI state management.
- src/backend: orchestration services, sandbox workflows, and plugin loading.
- src/backend/llm: connector implementations and prompt management.
- src/plugins: syntax and agent plugins.
- src/agents: ideas agent, planning agent, principal orchestrator.
- examples: plugin and workflow examples.
- tests/unit and tests/e2e: unit and end-to-end validation setup.

## Working guidelines

- Keep the front-end, backend, and agent contracts clearly separated.
- Prefer typed interfaces and explicit plugin boundaries.
- Validate behavior with focused unit tests and end-to-end smoke checks.
- Document architecture and roadmap updates in the project files.

## Roadmap and guidance

See the project docs for the intended implementation plan and contributor expectations:

- [README.md](README.md)
- [roadmap.md](roadmap.md)
- [testing_plan.md](testing_plan.md)
- [copilot_instructions.md](copilot_instructions.md)
- [ui_design.md](ui_design.md)

## Testing and release readiness

Before the final product version, the project will move through a QA and validation phase focused on:

- smoke and regression tests,
- E2E validation of the agent workflow,
- sandbox security and permission checks,
- release candidate readiness and bug triage.

The testing strategy is documented in [testing_plan.md](testing_plan.md), and the operational QA gate is tracked in [qa_checklist.md](qa_checklist.md).

## Release 1.1.0 status

This release hardens the approval workflow for production review. It includes runtime plugin permissions, restricted auto-approval, observable workflow events, cancellation, atomic multi-file changes with base-content conflict checks, and the validated approval UX.

The current editor surface remains a lightweight desktop editor based on a textarea. Monaco integration, a full history view, and the complete business-flow E2E harness remain follow-up work and are not claimed as part of this release.



## Release 1.1.0 validation

Validated on 2026-09-18 with the configured Ollama endpoint and deterministic local fallback tests. The suite passed 8 unit suites and 57 tests, the smoke E2E suite passed 3 tests, the TypeScript build passed, and the Linux packaging script completed. The workflow preserves task and snapshot metadata and supports an approval-ready atomic patch cycle inside the workspace.
