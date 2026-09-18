# Release notes

## Nexio IDE 1.1.0 Production Release

- Stable desktop IDE shell for Linux with workspace, editor, agent workflow, and approval flow.
- Verified architecture for ideas → planning → orchestrator → principal execution.
- Real LLM integration validated with Ollama and provider fallback behavior.
- Sandbox hardening confirmed for traversal, symlink escapes, and restricted workspace writes.
- Workflow audit trail and decision history persisted to support release validation and operations review.
- Structured multi-file changes with SHA-256 base-content conflict checks and atomic application.
- Runtime plugin enablement, capabilities and restricted auto-approval policy enforced by the backend.
- Workflow progress events and user cancellation exposed through the Electron IPC boundary.
- Unit, regression and smoke E2E checks executed successfully with an approval-ready diff cycle.

## Production gate status

- [x] Core functionality stabilized and validated
- [x] Sandbox protections verified
- [x] Agent orchestration flow validated
- [x] Real LLM runtime check completed against the configured environment
- [x] Regression and workflow tests passing
- [x] Release documentation and QA checklist aligned with the project roadmap
- [x] Multi-file patch atomicity and conflict protection verified
- [x] Workflow cancellation and progress events verified
- [x] Plugin enablement and auto-approval policy verified

## Release recommendation

This release is ready to move through the GitFlow release process from develop into `release/v1.1.0` and then to `main` after the final operational checks and merge.
