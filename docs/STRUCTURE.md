# Project structure

Proposed layout — create directories as their first file is added, don't
scaffold empty folders ahead of need. Update this doc if the real structure
diverges (it will, a little; keep it honest).

```
legio/
├── CLAUDE.md
├── README.md
├── package.json
├── tsconfig.json              # editor-only; typecheck uses the three below
├── tsconfig.{base,node,web,test}.json
├── electron.vite.config.ts    # bundling (docs/ARCHITECTURE.md → Build tooling)
├── electron-builder.yml       # packaging
├── vitest.config.ts
├── playwright.config.ts       # E2E smoke tests
├── eslint.config.mjs
├── .gitleaks.toml             # secret-scan config (pre-commit + CI)
├── .husky/pre-commit
├── .github/                   # CI workflow + Dependabot
├── .nvmrc
├── .env.example
├── .gitignore
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DOMAIN_MODEL.md
│   ├── ORCHESTRATION.md
│   ├── SECURITY.md
│   ├── STRUCTURE.md          (this file)
│   └── ROADMAP.md
│
├── src/
│   ├── shared/                # imported by BOTH main and renderer — the
│   │   │                       # single source of truth for the IPC contract
│   │   ├── types/              # Company, Worker, Channel, Message, etc.
│   │   ├── ipc-contract.ts     # request/response/event types per IPC channel
│   │   └── constants.ts        # APP_NAME lives here — one place to rename
│   │
│   ├── main/                   # Electron main process — Node, full trust
│   │   ├── index.ts             # app entry, BrowserWindow creation, hardening
│   │   ├── db/
│   │   │   ├── migrations/       # numbered SQL migration files
│   │   │   ├── schema.ts         # or migration runner + queries
│   │   │   └── index.ts
│   │   ├── agent-runtime/
│   │   │   ├── AgentRuntime.ts    # the interface (docs/ARCHITECTURE.md)
│   │   │   ├── MessagesApiRuntime.ts
│   │   │   └── pricing-config.ts  # editable model IDs + $/token, not hard-coded
│   │   ├── orchestrator/
│   │   │   ├── Orchestrator.ts
│   │   │   ├── routing.ts         # mention/lead-worker logic
│   │   │   ├── loopGuard.ts
│   │   │   └── contextWindow.ts   # per-worker context assembly + caching
│   │   ├── tools/
│   │   │   ├── builtins/           # send_message, handoff, pass, load_skill, fs tools
│   │   │   └── riskClassification.ts
│   │   ├── approvals/
│   │   │   └── ApprovalsGate.ts
│   │   ├── scheduler/
│   │   │   ├── Scheduler.ts
│   │   │   └── missedRuns.ts
│   │   ├── mcp/
│   │   │   └── MCPManager.ts
│   │   ├── usage/
│   │   │   └── UsageLedger.ts
│   │   ├── security/
│   │   │   ├── secrets.ts          # safeStorage/Keychain wrapper
│   │   │   └── sandboxPath.ts      # workspace path validation (unit-tested)
│   │   ├── ipc/
│   │   │   ├── register.ts         # wires handlers to ipcMain, rejects untrusted frames
│   │   │   └── handlers/           # one file per IPC domain, validated with zod;
│   │   │                            # no electron import, so they're unit-testable
│   │   ├── windows.ts              # main + Settings window creation
│   │   ├── menu.ts                 # native application menu
│   │   └── preload.ts              # bundled to out/preload/index.js (CJS, sandboxed)
│   │
│   └── renderer/                # React UI — no Node, no direct DB/network
│       ├── main.tsx
│       ├── app/
│       │   ├── companies/
│       │   ├── workers/
│       │   ├── channels/         # chat UI, streaming, worker avatars
│       │   ├── approvals/
│       │   ├── usage/            # cost dashboard
│       │   ├── routines/
│       │   ├── skills/
│       │   ├── connectors/
│       │   └── settings/
│       ├── components/            # shared UI primitives
│       └── lib/
│           └── ipc-client.ts      # thin wrapper over the exposed preload API
│
├── tests/
│   ├── helpers/                  # shared fakes (e.g. the fake Anthropic client)
│   ├── e2e/                      # Playwright-Electron smoke tests + API stub
│   ├── db/  security/  ipc/  agent-runtime/   # added in M1
│   ├── orchestrator/
│   ├── loopGuard/
│   ├── approvals/
│   ├── budget/
│   └── sandboxPath/
│
├── build/                       # electron-builder *resources* (entitlements,
│                                 # icons, DMG background) — tracked in git
└── release/                     # electron-builder *output* — git-ignored
```

Build output from `electron-vite` goes to `out/` (git-ignored).

## Naming and conventions

- One `APP_NAME` constant in `src/shared/constants.ts` — nothing else
  hard-codes the app's display name (`index.html`'s `<title>` is filled from
  it at build time). A separate `APP_ID` (`legio`) names the data directory
  and must not change on a rename — see `docs/SECURITY.md`.
- Shared types in `src/shared/types` are the only definition of each entity;
  main and renderer both import from there rather than redeclaring shapes.
- IPC channel names are namespaced strings matching the domains above
  (`"companies:create"`, `"approvals:resolve"`, etc.), defined as constants
  in `ipc-contract.ts`, not typed as free-form strings at call sites.
- Tests live alongside the `tests/` tree mirroring the module under test, not
  inline `*.test.ts` scattered through `src/` — keep it easy to see coverage
  of the required areas at a glance (orchestrator, loop guard, approvals,
  budget enforcement, sandbox path validation — see `CLAUDE.md`).
