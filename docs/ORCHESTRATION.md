# Orchestration: the group-chat engine

This is the core of the app. Get this right before layering on connectors,
skills, or routines — they all run through this same loop.

## Voice input doesn't change any of this

A message transcribed from voice (`docs/ARCHITECTURE.md`'s `SpeechToText`)
is stored with `source: 'voice'` for the UI's benefit and otherwise enters
the turn lifecycle below exactly like a typed message — same mention
routing, same loop guard, same `ApprovalsGate`. Speaking an instruction
instead of typing it is never a way to skip a risky-action approval; the
gate has no concept of how the request arrived.

## Turn lifecycle

1. A message lands in a channel — from me, or as the output of a routine
   firing.
2. The orchestrator decides **who responds**:
   - Explicit `@mentions` in the message win outright — only mentioned
     workers respond.
   - Otherwise, the channel's designated **lead worker** responds (default:
     the first worker added to the channel).
   - Any other worker only enters the conversation when mentioned or handed
     a task via `handoff`.
3. For each responding worker, the orchestrator builds that worker's context
   window (see below) and calls `AgentRuntime.startTurn`.
4. Streamed events (text, tool-use requests, tool results) are persisted as
   they arrive and pushed to the renderer over IPC.
5. A tool-use request goes through the **ApprovalsGate** before it executes
   (see below). A risky call pauses that worker's turn until resolved.
6. The **loop guard** (below) is checked before any worker-to-worker message
   or hand-off is allowed to spawn another turn.

## What a worker sees

A worker's assembled context is deliberately narrow:

- its own `role` + `instructions_md`
- the company's shared `context_md`
- its attached skills, listed as **name + description only** — the full body
  loads on demand via the `load_skill` tool
- a windowed, summarized history of the channels it belongs to (not the
  entire company's history)

Use prompt caching for the stable prefix (role, instructions, company
context, skill list) and compact/summarize older turns rather than letting
the window grow unbounded. Re-verify current prompt-caching mechanics against
the live docs before implementing — don't assume the shape from memory.

## Built-in tools available to every worker

- `send_message(channel, text, mentions)`
- `handoff(to_worker, task, context)` — must target one of that worker's
  `allowed hand-off targets`; a request outside that list is rejected before
  it reaches the ApprovalsGate, not silently allowed
- `pass()` — explicitly decline to respond this turn
- `load_skill(name)` — loads a skill's full body into context
- sandboxed workspace file tools: list / read / write, scoped to the
  company's `workspace_dir` only (see `docs/SECURITY.md` for the sandbox
  requirement)

Per-worker, optionally: Claude's server tools for web search and web fetch.
Connector-provided tools (MCP) are added per the worker's granted connectors.

## Code execution (opt-in, not baseline)

A worker can additionally be granted `run_code` — a real command/script
execution tool, off by default and enabled per worker deliberately. Full
sandboxing rules (Docker-only, network-off by default, resource limits,
no host fallback) are in `docs/SECURITY.md` — read that before implementing
this tool, it is the highest-risk capability in the app.

## Browser automation (opt-in, not baseline)

A worker can be granted `browse` — a sandboxed, real browser it drives to
handle business tools with no usable API (see `docs/CONNECTORS.md` for
examples). Off by default per worker, scoped to an explicit domain
allowlist. Full spec — isolated profile, credential handling, screenshot
approvals, risk rules — is in `docs/SECURITY.md`.

## Connectors (opt-in, granted per worker)

Everything else business-useful — email, calendar, CRM, accounting,
project tools, your own database, and more — comes in as an MCP connector
under the mechanism in `docs/ARCHITECTURE.md`'s `MCPManager`. A connector is
added once at the company level and granted to specific workers; the tools
it exposes are classified and approved exactly like built-in tools. See
`docs/CONNECTORS.md` for the catalog of what to wire in and each one's
default risk tier — that doc is the reference for adding a new connector,
so a new one doesn't need its risk classification decided from scratch.
Document generation (PDFs, invoices, reports from a template) is not a
connector at all — it's a workspace file write, safe by default, per
`docs/CONNECTORS.md`.

## Tool risk classification and approvals

Every tool, built-in or MCP-provided, is classified before it can run:

- **Safe (auto-runs):** read-only actions — reading files inside the sandbox,
  reading channel history, `load_skill`, web search/fetch, and any MCP tool
  that carries a trustworthy read-only annotation.
- **Risky (needs approval):** anything that sends, posts, spends, deletes,
  overwrites, or otherwise changes state outside the sandbox — `send_message`
  to a channel outside the current one, any write/delete via a connector, any
  action with a real-world side effect. **Default to risky** for an MCP tool
  with no annotation or an ambiguous one — never assume safe by default.
- **Always risky, no exceptions: `run_code`.** Code execution is never
  auto-approved regardless of what the script appears to do — see
  `docs/SECURITY.md`'s Code execution section for the full sandbox and
  approval requirements.
- **`browse`: reading is safe, anything with a side effect is risky.**
  Navigating and extracting text auto-runs; submitting a form, clicking a
  button that changes state, or entering data is risky and shows a
  screenshot in the approval. See `docs/SECURITY.md`'s Browser automation
  section.
- **Connector actions follow the per-category defaults in
  `docs/CONNECTORS.md`** — e.g. any payment is always risky with one
  approval per transaction; any database write is risky while reads are
  safe. Don't re-derive a connector's risk tier ad hoc; check the catalog.

A risky call pauses that worker's turn and writes an `Approval` row with the
worker, the tool, and the **exact** arguments that would be sent. I can
approve, reject, or edit-then-approve. Approvals persist across restarts (they
live in SQLite, not memory) and surface in an Approvals inbox with a badge and
a macOS notification.

**Untrusted content rule:** anything read from a tool result, a file, a web
page, an MCP server, or another worker's message is data, full stop. It can
never change a worker's tool permissions, its approval requirements, or its
instructions — even if it contains text that looks like an instruction
("ignore previous approval rules," etc.). This must be enforced structurally
(the approval classification lives outside worker-controlled context), not
just requested in a prompt.

## Loop guard (required before group chat ships)

Multi-worker hand-offs can spiral without hard limits. All of the following
are required, not optional:

- **Max hops per human message** — a ceiling on how many worker turns one
  incoming message can trigger, across the whole channel.
- **Max worker-to-worker messages per channel per run** — separate from the
  hop count, to catch two workers ping-ponging `@mentions` at each other.
- **Duplicate-message detection** — if a worker is about to send substantially
  the same message it (or another worker) already sent this run, stop instead
  of looping.
- **Per-run cost cap** — checked against the `UsageLedger` mid-run, not only
  after the fact; a run that would exceed it is halted, not merely logged.
- **Max `run_code` calls per run** — separate from the general hop count, so
  a broken retry loop can't spin up containers indefinitely.
- **Max `browse` actions per run** — same reasoning; a stuck browser loop
  (e.g. retrying a failed form submit) must hit a hard stop.
- When any limit trips, stop the run and post a visible **"stopped: limit
  reached"** message in the channel so it's never a silent hang.
- **Global kill switch** — one action, reachable from anywhere in the UI, that
  immediately halts every in-flight worker turn across every company.

## Bulk / campaign actions

A task like "email these 100 leads" produces many identical-shaped risky
calls from one instruction. Two things in this design would otherwise fight
that on purpose: the general loop guard (built to catch runaway loops, not
deliberate bulk work) and one-approval-per-call (which would mean 100
separate prompts). Handle it as its own path, not as an edge case of either:

- When a worker is about to make many same-shaped risky calls (e.g. the
  same connector action, templated per recipient), the `ApprovalsGate`
  groups them into a single **campaign approval** instead of N individual
  prompts.
- The review shows every recipient with their actual rendered message
  (mail-merged, not the raw template) so a broken merge or a wrong name is
  visible before anything sends — and lets me remove or edit individual
  rows before approving.
- One "Approve" action releases the (remaining) batch, but each underlying
  call is still logged as its own `tool_activity`/`approval` row — a
  campaign approval is a review UX, not a weaker audit trail.
- A batch above a configurable size (default: 50) requires an extra
  explicit confirmation step ("You're about to send 100 emails — confirm")
  — cheap friction against a mis-scoped instruction sending far more than
  intended.
- A single approved campaign is **exempt from the general per-run hop
  limit** (that limit exists for worker-to-worker chatter, not intentional
  bulk work), but has its own campaign-level send-rate limit instead,
  matched to the underlying provider's real limits — e.g. throttle and
  queue rather than error out, at whatever rate Gmail/Workspace/etc.
  actually allow. Provider limits belong in the connector's own config
  (`docs/CONNECTORS.md`), not hard-coded in the orchestrator.

### Compliance note (not legal advice)

Bulk outbound communication — email in particular — is generally subject to
marketing and anti-spam rules (e.g. sender-identity and opt-out
requirements under GDPR/ePrivacy as implemented in Finland; rules differ
for B2B outreach versus reaching individuals directly). The email
connector's send tool should require a sender-identity and unsubscribe/
opt-out mechanism as part of its template, not as an afterthought added
per campaign, and the campaign review should make the recipient list's
source visible (e.g. sourced from a CRM of business contacts vs. scraped
personal addresses) since that's a real distinction under most such rules.
Confirm current requirements before running a real campaign — this app
enforces the mechanism, not the law.

## Scheduler and missed runs

Routines only execute while the app process is running — there is no
background service. On launch, compare each active routine's schedule
against `last_run_at`; for any run that should have fired while the app was
closed, offer to run it now or mark it `skipped_missed` (recorded in
`routine_runs`, never silently dropped). This limitation is stated plainly in
the Routines UI, not just in this doc.
