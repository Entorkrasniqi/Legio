# Architecture

## Processes

Standard hardened Electron shape — three trust zones, one direction of truth.

```
┌───────────────────────────── Main process (Node) ─────────────────────────────┐
│                                                                                 │
│  Database (SQLite, better-sqlite3, migrations)                                │
│  AgentRuntime  (calls the Claude API — the only thing that talks to Anthropic) │
│  Orchestrator  (routing, hand-offs, loop guard — see docs/ORCHESTRATION.md)    │
│  ApprovalsGate (classifies tool calls, pauses on risky ones)                   │
│  Scheduler     (cron routines, runs while the app is open)                     │
│  MCPManager    (connector lifecycle, tool discovery)                          │
│  UsageLedger   (every API call → tokens → cost)                               │
│  Keychain/safeStorage (API key, connector secrets)                            │
│                                                                                 │
└──────────────────────────────── typed IPC only ───────────────────────────────┘
                                        │
                                 preload (contextBridge)
                                        │
┌───────────────────────────── Renderer (Chromium) ─────────────────────────────┐
│  React UI only. No Node access. No direct DB or network access.               │
│  Talks to main exclusively through the typed IPC surface below.               │
└─────────────────────────────────────────────────────────────────────────────────┘
```

Nothing in the renderer ever sees the API key, the raw Anthropic client, the
filesystem, or a database handle. If the UI needs data, it asks main over IPC
and gets a typed response.

## Why this shape

- The Claude API key, tool execution, and file access are all things that must
  not be reachable from a Chromium renderer (see `docs/SECURITY.md`). Keeping
  the whole `AgentRuntime` + tool layer in main is what makes that possible.
- Everything that must survive the app being closed and reopened (companies,
  workers, messages, approvals, usage) lives in SQLite in main, not in
  renderer state.

## The `AgentRuntime` interface

This is the seam that lets today's "workers run inside the app via the
Messages API" decision change later without a rewrite:

```ts
interface AgentRuntime {
  startTurn(input: AgentTurnInput): AsyncIterable<AgentTurnEvent>;
  cancelTurn(turnId: string): Promise<void>;
}
```

`AgentTurnInput` carries the worker's resolved system prompt, the message
window, available tools, and model. `AgentTurnEvent` is a discriminated union
covering streamed text, tool-use requests, tool results, and turn completion
with usage. v1 ships exactly one implementation, `MessagesApiRuntime`, built on
the Anthropic TypeScript SDK with streaming and prompt caching. A future
`ManagedAgentsRuntime` would implement the same interface; nothing above the
interface should need to know which one is running.

**Before implementing or changing `MessagesApiRuntime`:** fetch and read the
current API docs (start at `https://platform.claude.com/llms.txt`) for the
Messages API, streaming, tool use, prompt caching, and the models page. Do not
assume model IDs, request/response shapes, or pricing from training data —
verify them against the live docs and keep prices/model IDs in one config
module (see `docs/DOMAIN_MODEL.md` → UsageLedger).

## Voice (optional)

Talking to a worker instead of typing. This is purely an input/output
encoding on top of the existing message pipeline — a transcribed voice
message is stored and routed exactly like a typed one (see
`docs/ORCHESTRATION.md`), and it goes through the `ApprovalsGate` the same
way: saying "send it" changes nothing about whether a risky action needs
approval.

Two swappable interfaces, mirroring `AgentRuntime`:

```ts
interface SpeechToText {
  transcribe(audio: Buffer, opts?: { language?: string }): Promise<string>;
}
interface TextToSpeech {
  synthesize(text: string, voiceId: string): Promise<Buffer>; // audio
}
```

**Default implementations, chosen to keep voice local-first:**

- `SpeechToText` → a local Whisper model (e.g. via `whisper.cpp` bindings or
  a bundled CLI binary). Audio never leaves the machine with this default.
  Runs CPU-only on the Intel dev Mac (no Metal acceleration) — noticeably
  slower than on Apple silicon; ship a smaller/faster model by default and
  let a larger, more accurate model be selected in Settings if the speed
  trade-off is acceptable.
- `TextToSpeech` → macOS's own system voices (spawn `say`, or use
  `AVSpeechSynthesizer` via a small native bridge). No API cost, no new
  network call, no new secret. Each worker can be assigned a distinct
  system voice in its inspector — one more part of its identity alongside
  name, avatar, and color.

Both interfaces can later be swapped for a cloud connector (better
transcription accuracy, more expressive TTS voices) — that's an explicit,
per-feature opt-in with its own API key in Keychain, not a default, because
it changes voice from "stays on this Mac" to "sent to a third party." See
`docs/SECURITY.md`.

**UI:** a push-to-talk control in the chat view (hold or toggle to record;
the transcript appears as editable text before it's actually sent — a
misheard word shouldn't silently become your instruction). A per-worker
"speak responses" toggle in its inspector panel controls whether its text
replies are also synthesized and played back.

## Layers in main

- **Database** — SQLite via `better-sqlite3`, with a migrations runner.
  **Decided (M1): plain numbered SQL files** (`src/main/db/migrations/NNN_name.sql`)
  plus a small in-repo runner (`src/main/db/migrate.ts`) — no migration
  library. The SQL is inlined into the main bundle at build time, so a
  packaged app never reads migration files from disk. Each migration runs in
  its own transaction and is recorded in `schema_migrations` with a SHA-256
  checksum; startup fails loudly if an applied migration was edited, if
  numbering has a gap, or if the database is newer than the app. Fix a bad
  migration with a new one, never by editing an applied one. WAL mode and
  `foreign_keys = ON`. Schema in `docs/DOMAIN_MODEL.md`.
- **Orchestrator** — owns a channel's turn loop: decides which worker(s)
  respond to an incoming message, invokes `AgentRuntime` for each, applies the
  loop guard, and persists messages/tool activity as they stream in. Detailed
  in `docs/ORCHESTRATION.md`.
- **ApprovalsGate** — sits between a worker's requested tool call and its
  execution. Classifies the call (safe/risky), and for risky calls, halts that
  worker's turn, writes an `Approval` row, and resumes only on my decision.
- **Scheduler** — in-process cron (e.g. `node-cron` or equivalent), one job per
  active `Routine`, each job invoking the orchestrator as if the message came
  from me. Only runs while the app process is alive; see the Scheduler section
  of `docs/ORCHESTRATION.md` for missed-run handling.
- **MCPManager** — starts/stops configured MCP servers (stdio or HTTP) using
  the official MCP TypeScript SDK, discovers their tools, and exposes them to
  the orchestrator per-worker based on which connectors that worker is granted.
- **UsageLedger** — a write-only-from-the-inside log of every API call's token
  usage and computed cost, keyed to worker/company/run. The budget dashboard
  and hard-stop enforcement both read from this.

## IPC contract

Preload exposes a small, typed surface via `contextBridge` — grouped by
domain (`companies.*`, `workers.*`, `channels.*`, `messages.*`,
`approvals.*`, `routines.*`, `skills.*`, `connectors.*`, `usage.*`,
`settings.*`). Each call is request/response or a subscription (for
streaming chat and live approval updates). Define the full request/response
and event types in one shared module imported by both main and preload/
renderer, so main and renderer can never silently drift out of sync — see
`docs/STRUCTURE.md` for where that module lives.

All IPC input arriving in main is validated (e.g. with `zod`) before it
touches the database or the `AgentRuntime` — the renderer is not trusted
input just because it's "our own UI."

## Build tooling

**Decided (M1): `electron-vite`** for dev server and bundling (main,
preload, renderer → `out/`), and **`electron-builder` for packaging only**
(config in `electron-builder.yml`, resources in `build/`, output in
`release/`). The preload is bundled as a single CommonJS file, which is what
a `sandbox: true` preload requires.

**Native modules, as verified in M1 (better-sqlite3 13, Electron 44, x64):**
better-sqlite3 13+ ships prebuilt **Node-API** binaries for `darwin-x64`
and `darwin-arm64` and picks one at runtime, so it does not need a
per-Electron-ABI rebuild and both Mac architectures are covered by the
same install. `electron-builder install-app-deps` still runs on
`postinstall` so any future ABI-specific native dependency is rebuilt
automatically. `electron-builder.yml` excludes the Windows/Linux
prebuilds from the packaged app.

Unit tests run under Electron's own Node (`ELECTRON_RUN_AS_NODE=1`), so
they exercise the same runtime (Node 24 inside Electron 44) the app's main
process uses, not whatever system Node happens to be installed.

## Packaging

`electron-builder`, targeting both `x64` and `arm64` DMGs. Native modules
must be rebuilt per-architecture as part of the packaging step, not just for
whichever machine happens to run the build — verify this explicitly since
development happens on x64 and arm64 packaging can't be "tested by habit."
