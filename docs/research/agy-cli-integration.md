# Antigravity CLI integration

Official documentation and installed `agy --help` checked on 2026-10-15. Research did not inspect or change global settings/authentication files. Service execution intentionally uses CLI cached login.

## Analysis agent

The CLI discovers workspace agents from `.agents/agents/<name>.md`. Custom agent frontmatter has an explicit permitted `tools` list and can allow primary-agent selection. A dedicated temporary workspace can contain this definition:

```yaml
---
name: decision-analysis
description: Analyze only conversation text supplied in the prompt.
mainAgent: true
subagent: false
tools: [finish]
commandExecutionPolicy: off
mcpServers: []
skills: []
plugins: []
---
Analyze the supplied conversation and return the requested structured result.
```

Select it with `--agent decision-analysis`. The documented tools list defines permitted capabilities. Installed-build probes showed that `tools: []` omitted the `finish` tool and caused repeated completion turns without a structured result; allowing only `finish` produced one-turn SUCCESS with structured_output. The stream's init.tools listed global capabilities even for the empty agent, so that list alone is not evidence of the selected agent's effective tools. No filesystem, command, browser, delegation, or MCP tools are allowed in the application agent. [Custom agents](https://antigravity.google/docs/subagents/), [Headless model/agent selection](https://antigravity.google/docs/cli/headless/)

`--mode plan` alone does not disable tools: it adds planning instructions and permits read tools. `--sandbox` contains terminal operations, while workspace file access is auto-allowed by default. Fine-grained denial rules exist for file, command, URL, and MCP actions, but the documented CLI settings location is `~/.gemini/antigravity-cli/settings.json`. Project scope exists in `/permissions`; an exact project-local file location or settings-path environment override was not found in official docs. Do not invent one or modify global settings as a side effect of service calls. [Execution modes](https://antigravity.google/docs/cli/modes), [Permissions](https://antigravity.google/docs/permissions?tab=cli), [Permission scope UI](https://antigravity.google/docs/cli/commands/permissions/)

## Input, output, accounting

Use `--input-format stream-json --output-format stream-json --json-schema <schema> --disable-slash-commands`. Submit a single newline-delimited `{"event":"user","message":{"content":"..."}}` through stdin; prompts passed with `-p` are ignored in streaming-input mode. A single `init`, multiple `step_update`, and a terminal `result` event are emitted. The final `result.structured_output` contains the parsed schema output, and `result.response` serializes it. Validate it again in the application. Require terminal `SUCCESS`, valid output, and successful process exit. [Headless protocol](https://antigravity.google/docs/cli/headless/)

`result.usage` supplies input, output, thinking, cache-read, and total token counters. In persistent multi-turn streams these counters are cumulative; calculate deltas rather than summing cumulative values. A fresh one-turn process avoids this complication. Soft-denied tools can still yield process exit 0, so exit status alone proves neither correct output nor tool isolation. [Headless protocol and permissions](https://antigravity.google/docs/cli/headless/)

## Process isolation and lifetime

Application recommendations (not guaranteed CLI semantics): spawn without a shell, in an isolated temporary cwd containing only the dedicated agent definition; pass an explicit environment allowlist rather than inherited application secrets. Retaining the real home directory may be needed for existing Google-account login, but also permits CLI global discovery; changing home can break auth and should not silently copy credentials. `--new-project` creates persistent CLI project state; it is not equivalent to no storage or OS isolation. [Projects](https://antigravity.google/docs/projects), [Headless authentication](https://antigravity.google/docs/cli/headless/)

Close stdin after the final prompt; the CLI finishes the active turn and exits. Supply a finite `--print-timeout` because the installed help reports default `0s` (unbounded), even though older examples mention five minutes. Also impose an outer application timeout, bounded stdout/stderr, cancellation handling, and cleanup of temporary files after child termination. The official docs do not promise child-tree termination on timeout; use and test a process-group termination strategy on supported platforms. [Graceful session closure and timeout](https://antigravity.google/docs/cli/headless/)

## Applied service configuration

Root `.env`: `AI_PROVIDER=agy`, `AI_MODEL=gemini-3.8-flash-low`, optional `AGY_EXECUTABLE` (installed absolute path or PATH executable). The CLI must be installed and logged in as the OS user running BE. Gemini/OpenAI HTTP providers remain explicit alternatives and stored workflows preserve their provider/model; there is no automatic fallback.

Each attempt spawns a fresh stream-json process in a temporary directory with the application `ggaddak-analysis` agent. Stdout is bounded to 16MiB and decoded as UTF-8, stderr is consumed without exposing conversation data, and the outer 45-second timer/AbortSignal terminates the process group. SUCCESS, structured_output and nonnegative token usage are required. Global CLI project/conversation artifacts may persist according to CLI behavior even after the temporary cwd is removed.

`AI_MAX_INPUT_CHARS=0` disables the optional character safeguard. AGY has no exposed exact countTokens preflight; configuring `AI_MAX_INPUT_TOKENS` for CLI mode fails explicitly. `AI_MAX_OUTPUT_TOKENS` is checked against returned output usage after generation, so it is not a pre-generation billing cap. Antigravity account/model limits still apply. The HTTP evaluation runner supports gemini/openai and does not pretend its HTTP budgets govern a CLI harness.

Real cached-login analysis on the four-turn Korean PostgreSQL/Redis sample completed with two CLI attempts and no repair, about 27.9 seconds: PostgreSQL agreed, Redis proposed, DB connection assignee 민수, dueDate null. Both candidates were persisted and queried in temporary SQLite. Aggregate reported input=25021/output=598 tokens; this includes CLI system context and must not be compared as if identical to direct-API prompts. Report: ignored `.data/evaluation/agy-live-2026-10-15.json`. Operating database and real Discord channels were not touched.

## Model selection by analysis stage

`AI_MODEL` is the default. Optional `AI_MODEL_EXTRACT`, `AI_MODEL_VERIFY`, and `AI_MODEL_REPAIR` select models within the configured provider. Reverification uses the verify selection. For agy use exact slugs from `agy models`; neither an unavailable model nor a CLI failure triggers an automatic substitute.

Example: keep `AI_MODEL=gemini-3.8-flash-low` and set `AI_MODEL_VERIFY=gemini-3.8-flash-medium`. Unset stages keep Low. This is explicit stage routing, not automatic conversation-complexity detection. No higher-cost production override was enabled by implementing this feature.

Rules are copied into durable workflow settings at analysis start; server restart or environment changes apply to new analyses. Each persisted attempt records its selected provider/model. Old workflows without stage rules keep their original single model. The HTTP evaluation runner deliberately ignores service stage overrides and uses its explicit --model for fair baseline/workflow comparison.

Live two-model verification succeeded with extraction Low and critic Medium: completed, two attempts/no repair, about 36.2 seconds, input=24655/output=1420. Report: ignored `.data/evaluation/stage-model-live-2026-10-15.json`. Regression tests also verify old model selection after a failed verify, database restart, changed defaults, and midflight settings mutation.
