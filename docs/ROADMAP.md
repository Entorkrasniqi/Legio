# Roadmap

Work through these in order. Each milestone must satisfy the definition of
done in `CLAUDE.md` (builds and runs on the Intel Mac, typecheck/lint/test
pass, no secrets in git, docs updated if a recorded decision changed,
committed) before moving to the next.

## M1 — Scaffold
Electron + React + TypeScript project, hardened `BrowserWindow`
(`docs/SECURITY.md`), SQLite with a working migrations runner, and a
Settings screen that accepts an API key (stored via `safeStorage`), makes one
real test call to the Claude API, and reports success/failure. This is the
milestone that proves the whole toolchain works on the Intel Mac, including
native-module rebuilds — don't skip verifying that.

Also in this milestone, not deferred to M10: the GitHub Actions CI workflow
and the husky + lint-staged pre-commit hooks (including the secret-scanning
hook) from `docs/DEVOPS.md`. Set these up while the repo is still small —
every milestone after this one should already be running through CI, not
just the last one.

## M2 — Companies and workers
CRUD for companies and workers, including the generic worker templates
(`docs/DOMAIN_MODEL.md`). No chat yet — just create/edit/archive and the
inspector UI for a worker's fields.

## M3 — Direct chat with one worker
A single worker in a single-member channel: streaming responses via
`AgentRuntime`/`MessagesApiRuntime`, messages persisted, and the
`UsageLedger` recording real token usage and cost per turn.

## M4 — Group channels and the loop guard
Multi-worker channels, `@mention` routing, the lead-worker default,
`handoff`, and **all** loop-guard mechanisms from `docs/ORCHESTRATION.md`
(hop limits, duplicate detection, per-run cost cap, visible stop message,
global kill switch). This milestone is not done with only some of the guard
in place — an ungated group chat is the main way this app can silently burn
money or spiral.

## M5 — Built-in tools, sandbox, and approvals
`send_message`, `pass`, `load_skill`, and the sandboxed workspace file tools;
tool risk classification; the `ApprovalsGate` pausing risky calls; the
Approvals inbox UI with a badge and macOS notifications. Sandbox path
validation must have the traversal tests described in `docs/SECURITY.md`
before this is done. The Approvals inbox must support the **campaign
approval** path from `docs/ORCHESTRATION.md` — reviewing and approving many
same-shaped risky calls as one grouped action, not just one-at-a-time
prompts — this is not a "nice to have" added later; a bulk task (e.g. a
100-recipient email send) is unusable without it.

Also in this milestone: the opt-in `run_code` tool. **Prerequisite: Docker
must be installed and the daemon reachable** — the app detects this and
disables `run_code` entirely (not a degraded host-execution fallback) when
it isn't. Requires: the container sandbox (workspace-only mount, network
off by default, resource limits, non-root, `--rm`), `run_code` wired into
the risk classifier as always-risky, the approval UI showing the exact
command/script plus resource limits and network flag, and the per-run
`run_code` call cap in the loop guard. Full spec in `docs/SECURITY.md` and
`docs/ORCHESTRATION.md` — this is not done with a "run it directly, ask
first" shortcut; the container boundary is the requirement, not the
approval prompt alone.

## M6 — Connectors, browser automation, and document generation
Add/test/remove MCP servers (stdio and HTTP) via the official MCP TypeScript
SDK, per-worker grants, secrets in Keychain, discovered tools shown with
their computed risk level. Work through `docs/CONNECTORS.md`'s catalog —
don't build every category in one pass; start with 2–3 that map to real use
(e.g. email, calendar, your own database), get the generic connector plumbing
right, and the rest follow the same pattern with no new architecture.

Also in this milestone:

- **`browse` (browser automation):** the isolated automation profile
  (Playwright), the credential-injection flow (worker + domain → Keychain,
  never exposed to the worker as text), the `worker_browser_domains`
  allowlist enforcement, and the screenshot-based approval UI. Full spec in
  `docs/SECURITY.md`. Prerequisite: Playwright's browser binaries installed
  (handled via its own postinstall, no separate app to install unlike
  Docker) — verify this works cleanly on the Intel Mac.
- **Document generation:** a PDF/report library wired into the workspace
  file tools (no connector, no new risk category — it's a sandboxed file
  write, safe by default, per `docs/CONNECTORS.md`).

## M7 — Skills
CRUD for skills, attach to workers, `load_skill` wired to real skill content,
and "create skill from this conversation" (distill → review → save,
exported/imported as markdown).

## M8 — Routines and scheduler
Cron routines per worker or channel, per-run budgets, run history, menu bar
presence (Tray), optional start-at-login and prevent-sleep, and the
missed-run catch-up flow from `docs/ORCHESTRATION.md` on launch.

## M9 — Budgets and cost dashboard
Hard-stop enforcement at company/worker/run level (reusing the pricing
config from `AgentRuntime`), plus the dashboard: spend today/this month, by
worker, by company, by model, a trend view, and top expensive runs.

## M10 — Polish and packaging
The macOS-native chrome from `docs/UI_DESIGN.md`: traffic-light window
inset, vibrancy, system accent color and dark/light following, the native
application menu with real keyboard shortcuts, the ⌘K quick switcher, and
Settings as its own compact window. Then: notifications polish, keyboard
navigation, and the scripted release pipeline from `docs/DEVOPS.md` —
`electron-builder` packaging for both x64 and arm64, **code signing,
notarization, and a properly arranged DMG**, not just an unsigned build —
verified with a fresh-machine install check, not just "it ran from the dev
build." Also add the E2E smoke-test coverage from `docs/DEVOPS.md` that
hasn't already been added incrementally per milestone, so the suite is
complete by the time this is called polished.

## M11 — Voice input and output (optional, additive)
Push-to-talk in the chat view, local Whisper transcription (editable before
it's actually sent as a message), and per-worker "speak responses" using
macOS system voices. Full spec in `docs/ARCHITECTURE.md` and
`docs/SECURITY.md`. This milestone doesn't gate anything before it — the
app is fully usable without voice — and it must not change approval
behavior in any way: a voice-originated risky action goes through the exact
same `ApprovalsGate` as a typed one. Verify actual transcription latency on
the Intel dev Mac before committing to a default model size; fall back to a
smaller/faster model rather than a degraded (e.g. host-unsandboxed, or
silently-cloud) shortcut.

## Explicit non-goals for v1

No iOS or web app, no Windows or Linux build (Mac-only by design, see
`docs/UI_DESIGN.md`), no multi-user/accounts, no billing, no
`ManagedAgentsRuntime` implementation (the `AgentRuntime` interface stays
ready for one, but building it is out of scope), no industry-specific
features or defaults anywhere.
