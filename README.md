# Legio

A local-first, **macOS-only** desktop app for running AI-agent "companies" —
built to macOS's own UI conventions (see `docs/UI_DESIGN.md`), not a
cross-platform app that happens to run here. Create a
company, staff it with worker agents (role, instructions, context, tools,
skills), let them collaborate in group chats and hand work to each other,
schedule recurring routines, and approve anything risky before it happens.

Business-agnostic by design — there's nothing industry-specific baked in.

> Status: early build. See `docs/ROADMAP.md` for what's done and what's next.

## Requirements

- macOS (developed on an **Intel Mac**, macOS Tahoe 26; packaging also targets
  Apple silicon)
- Node.js LTS (version in `.nvmrc`) and npm
- `gitleaks` (`brew install gitleaks`) — the pre-commit hook refuses to
  commit without it, rather than letting changes go unscanned for secrets
- Xcode Command Line Tools (`xcode-select --install`) — needed to build native
  modules like `better-sqlite3` on x64
- An Anthropic API key ([platform.claude.com](https://platform.claude.com))
- **Docker Desktop** — only required if you want to enable the `run_code`
  tool on any worker. Without it, everything else works; `run_code` is
  simply unavailable (the app never falls back to running code directly on
  your Mac). See `docs/SECURITY.md`.
- **Playwright browser binaries** — only required for the `browse` (browser
  automation) tool. Installed automatically via its own postinstall step
  when that feature is set up; no separate app install like Docker. See
  `docs/SECURITY.md` and `docs/CONNECTORS.md`.
- **Microphone access** — only required to talk to a worker instead of
  typing. macOS will prompt for permission the first time. Voice
  transcription runs locally by default (a Whisper model, downloaded once)
  and will be slower on this Intel Mac than on Apple silicon — see
  `docs/ARCHITECTURE.md`'s Voice section.

## Setup

```bash
git clone https://github.com/Entorkrasniqi/Legio.git
cd Legio
npm install            # also rebuilds native modules for Electron (postinstall)
cp .env.example .env   # if present — see docs/SECURITY.md for what goes where
npm run dev
```

The Anthropic API key is entered in the app's Settings screen on first run and
stored in the macOS Keychain via Electron's `safeStorage` — it is not read from
`.env` at runtime. `.env` (if used) is for local dev flags only; see
`docs/SECURITY.md`.

### If native module builds fail on Intel

`better-sqlite3` (and any other native dependency) must be rebuilt against
Electron's ABI, not your system Node's. If `npm run dev` fails with a module
version mismatch:

```bash
npm run rebuild   # electron-builder install-app-deps — see package.json
```

If you see an arm64/x64 mismatch, check that Node itself is the x64 build
(`node -p process.arch` should print `x64` unless you've deliberately switched
to an arm64 Node under Rosetta).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the app in development mode |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | Lint main + renderer |
| `npm test` | Run the vitest suite under Electron's Node (no real API calls — client is mocked) |
| `npm run test:e2e` | Build, then run the Playwright-Electron smoke tests (API is stubbed locally) |
| `npm run build` | Production build |
| `npm run package:dir` | Unsigned, unpacked x64 build — quick packaging sanity check |
| `npm run package` | Package with electron-builder (x64 and arm64) |

## Project docs

Start with `CLAUDE.md` for the project's ground rules, then:

- `docs/ARCHITECTURE.md` — processes, layers, IPC contract
- `docs/DOMAIN_MODEL.md` — entities and schema
- `docs/ORCHESTRATION.md` — group-chat engine, loop guard, approvals
- `docs/SECURITY.md` — key storage, hardening, sandboxing
- `docs/CONNECTORS.md` — connector catalog and default risk tiers
- `docs/UI_DESIGN.md` — macOS-native UI and distribution
- `docs/STRUCTURE.md` — folder layout
- `docs/ROADMAP.md` — milestones
- `docs/DEVOPS.md` — CI, pre-commit hooks, E2E smoke tests, release pipeline

## A known limit

Routines and schedules only run while the app is open (there's no background
server). The app surfaces this in the UI and offers to run or skip missed
routines on launch. Moving execution off-device would mean adding a cloud
agent runtime behind the existing `AgentRuntime` interface — not a v1 goal.
