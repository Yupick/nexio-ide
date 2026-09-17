# Release notes

## Nexio IDE 1.0.0 Production Release

- Stable desktop IDE shell for Linux with workspace, editor, agent workflow, and approval flow.
- Verified architecture for ideas → planning → orchestrator → principal execution.
- Real LLM integration validated with Ollama and provider fallback behavior.
- Sandbox hardening confirmed for traversal, symlink escapes, and restricted workspace writes.
- Workflow audit trail and decision history persisted to support release validation and operations review.
- Unit and regression checks executed successfully with an approval-ready diff cycle.

## Production gate status

- [x] Core functionality stabilized and validated
- [x] Sandbox protections verified
- [x] Agent orchestration flow validated
- [x] Real LLM runtime check completed against the configured environment
- [x] Regression and workflow tests passing
- [x] Release documentation and QA checklist aligned with the project roadmap

## Release recommendation

This release is ready to move through the GitFlow release process from develop into a production release branch and then to main after final merge approval and operational sign-off.
