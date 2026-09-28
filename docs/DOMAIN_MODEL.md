# Domain model

Entities as decided, with a schema sketch. Treat the SQL below as a strong
starting point, not gospel — adjust in a migration and update this doc in the
same commit if a real constraint forces a change.

## Entities

- **Company** — name, description, mission, shared context (markdown), budget
  limits, a sandboxed workspace folder on disk.
- **Worker** — name, avatar/color, role, instructions (system prompt), context
  documents, model, enabled built-in tools, granted connectors, attached
  skills, budget limits, allowed hand-off targets.
- **Channel** — belongs to a company. One default company-wide channel plus
  any number of custom group channels. A "direct chat" with one worker is just
  a channel with a single worker member.
- **Message** — belongs to a channel. Author is either me or a worker. Carries
  content, `@mentions`, associated tool-activity records, and token usage.
- **Task / hand-off** — created when a worker hands work to another worker;
  links the originating message, the target worker, the task brief, and the
  resulting thread of activity.
- **Skill** — name, description, instructions (markdown body), optional
  example files. Attached to zero or more workers.
- **Routine** — targets a worker or a channel; has a prompt, a cron schedule,
  a per-run budget, last-run info, and status (active/paused).
- **Approval** — a paused, pending risky action: which worker, which tool,
  the exact arguments, why it was flagged, and its resolution (approved /
  rejected / edited-then-approved).
- **Connector** — an MCP server configuration (stdio or HTTP), with secrets
  in Keychain and a per-worker grant list.
- **UsageLedger entry** — one row per API call: model, input/output/cached
  tokens, computed cost, and the worker/company/run it belongs to.

## Relationships

```
Company 1──* Worker
Company 1──* Channel
Company 1──* Skill
Company 1──* Connector
Channel  *──* Worker         (channel_members)
Channel  1──* Message
Message  1──* ToolActivity
Message  1──1 Handoff?       (optional, when the message creates one)
Worker   *──* Skill          (worker_skills)
Worker   *──* Connector      (worker_connectors)
Worker   1──* Routine        (routine.target_type = 'worker')
Channel  1──* Routine        (routine.target_type = 'channel')
Worker   1──* Approval
Worker   1──* UsageLedger entry
```

## Schema sketch (SQLite)

```sql
CREATE TABLE companies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  mission       TEXT,
  context_md    TEXT,
  workspace_dir TEXT NOT NULL,         -- absolute path, sandbox root
  budget_daily_cents   INTEGER,
  budget_monthly_cents INTEGER,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE workers (
  id                TEXT PRIMARY KEY,
  company_id        TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  avatar_color      TEXT,
  role              TEXT NOT NULL,
  instructions_md   TEXT NOT NULL,
  context_md        TEXT,
  model             TEXT NOT NULL,      -- e.g. 'claude-sonnet-5' — verify against docs, not memory
  enabled_tools     TEXT NOT NULL,      -- JSON array: built-in tool ids + server tool toggles
  code_execution_enabled INTEGER NOT NULL DEFAULT 0,  -- run_code opt-in, see docs/SECURITY.md
  code_execution_image   TEXT,          -- override the default Docker image, nullable
  browser_automation_enabled INTEGER NOT NULL DEFAULT 0,  -- browse opt-in, see docs/SECURITY.md
  tts_enabled   INTEGER NOT NULL DEFAULT 0,   -- speak responses back, see docs/ARCHITECTURE.md
  tts_voice     TEXT,                          -- system voice name, nullable
  budget_run_cents  INTEGER,
  budget_daily_cents INTEGER,
  archived_at       TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT NOT NULL
);

CREATE TABLE worker_handoff_targets (
  worker_id        TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  target_worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, target_worker_id)
);

CREATE TABLE channels (
  id          TEXT PRIMARY KEY,
  company_id  TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  is_default  INTEGER NOT NULL DEFAULT 0,
  lead_worker_id TEXT REFERENCES workers(id),
  created_at  TEXT NOT NULL
);

CREATE TABLE channel_members (
  channel_id  TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  worker_id   TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  PRIMARY KEY (channel_id, worker_id)
);

CREATE TABLE messages (
  id            TEXT PRIMARY KEY,
  channel_id    TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  author_type   TEXT NOT NULL CHECK (author_type IN ('human','worker')),
  author_worker_id TEXT REFERENCES workers(id),
  content       TEXT NOT NULL,
  source        TEXT NOT NULL DEFAULT 'text' CHECK (source IN ('text','voice')),
  mentions      TEXT,                  -- JSON array of worker ids
  run_id        TEXT,                  -- groups messages produced by one orchestrator run
  created_at    TEXT NOT NULL
);

CREATE TABLE tool_activity (
  id          TEXT PRIMARY KEY,
  message_id  TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  arguments_json TEXT NOT NULL,
  result_json    TEXT,
  risk_level  TEXT NOT NULL CHECK (risk_level IN ('safe','risky')),
  status      TEXT NOT NULL CHECK (status IN ('completed','pending_approval','rejected','error')),
  created_at  TEXT NOT NULL
);

CREATE TABLE handoffs (
  id               TEXT PRIMARY KEY,
  from_message_id  TEXT NOT NULL REFERENCES messages(id),
  from_worker_id   TEXT NOT NULL REFERENCES workers(id),
  to_worker_id     TEXT NOT NULL REFERENCES workers(id),
  brief            TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('open','accepted','completed')),
  created_at       TEXT NOT NULL
);

CREATE TABLE skills (
  id            TEXT PRIMARY KEY,
  company_id    TEXT REFERENCES companies(id) ON DELETE CASCADE, -- NULL = global/template
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,          -- shown to workers before the body is loaded
  instructions_md TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE worker_skills (
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  skill_id  TEXT NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, skill_id)
);

CREATE TABLE routines (
  id              TEXT PRIMARY KEY,
  company_id      TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_type     TEXT NOT NULL CHECK (target_type IN ('worker','channel')),
  target_id       TEXT NOT NULL,
  prompt          TEXT NOT NULL,
  cron_expression TEXT NOT NULL,
  timezone        TEXT NOT NULL,
  budget_run_cents INTEGER,
  status          TEXT NOT NULL CHECK (status IN ('active','paused')),
  last_run_at     TEXT,
  created_at      TEXT NOT NULL
);

CREATE TABLE routine_runs (
  id          TEXT PRIMARY KEY,
  routine_id  TEXT NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
  status      TEXT NOT NULL CHECK (status IN ('running','completed','failed','skipped_missed')),
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  error       TEXT
);

-- A campaign groups many same-shaped risky calls (e.g. one email send per
-- recipient) into a single review. See docs/ORCHESTRATION.md's Bulk /
-- campaign actions section.
CREATE TABLE approval_batches (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL REFERENCES workers(id),
  company_id    TEXT NOT NULL REFERENCES companies(id),
  title         TEXT NOT NULL,          -- e.g. "Send outreach email to 100 leads"
  tool_name     TEXT NOT NULL,
  item_count    INTEGER NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','partially_approved')),
  resolved_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE approvals (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL REFERENCES workers(id),
  tool_activity_id TEXT NOT NULL REFERENCES tool_activity(id),
  batch_id      TEXT REFERENCES approval_batches(id),  -- NULL for a standalone approval
  reason        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','edited_approved')),
  edited_arguments_json TEXT,
  resolved_at   TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE connectors (
  id           TEXT PRIMARY KEY,
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  transport    TEXT NOT NULL CHECK (transport IN ('stdio','http')),
  config_json  TEXT NOT NULL,           -- command/args or URL; secrets NOT stored here — see SECURITY.md
  created_at   TEXT NOT NULL
);

CREATE TABLE worker_connectors (
  worker_id    TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, connector_id)
);

-- Domain allowlist for the browse tool (docs/SECURITY.md). A worker with
-- browser_automation_enabled = 1 may only navigate within these domains;
-- a domain with no row here is unreachable to that worker.
CREATE TABLE worker_browser_domains (
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  domain    TEXT NOT NULL,             -- e.g. 'suppliers.example.com'
  PRIMARY KEY (worker_id, domain)
);

CREATE TABLE usage_ledger (
  id             TEXT PRIMARY KEY,
  company_id     TEXT NOT NULL REFERENCES companies(id),
  worker_id      TEXT NOT NULL REFERENCES workers(id),
  run_id         TEXT,
  model          TEXT NOT NULL,
  input_tokens   INTEGER NOT NULL,
  output_tokens  INTEGER NOT NULL,
  cache_read_tokens  INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_cents     REAL NOT NULL,        -- computed from the editable pricing config, not hard-coded
  created_at     TEXT NOT NULL
);
```

`tool_activity.arguments_json`/`result_json` for a `run_code` call carries
the command/script, the resource limits in effect, whether network access
was requested and granted, exit code, and duration — no separate table; see
`docs/SECURITY.md` for what must be shown in the approval before it runs.

`tool_activity.arguments_json`/`result_json` for a `browse` call carries the
target URL, the action taken, and a reference to the captured screenshot
(store the image itself as a file under the company workspace's internal
data, not inline in SQLite); see `docs/SECURITY.md`'s Browser automation
section. See `docs/CONNECTORS.md` for the full catalog of connector
categories (email, calendar, CRM, accounting, project tools, your own
database, and more) and each one's default risk tier — none of them need a
schema change beyond the existing `connectors`/`worker_connectors` tables
above.

Indexes to add once query patterns settle (at minimum): `messages(channel_id, created_at)`,
`usage_ledger(company_id, created_at)`, `usage_ledger(worker_id, created_at)`,
`approvals(status)`.

## Worker templates

Ship a small set of generic, editable starting points — not fixed roles:
Researcher, Writer, Analyst, Operator, Reviewer. Each is just a pre-filled
`role` + `instructions_md` + a sane default tool set; nothing about them is
special in code. They exist so "add a worker" isn't a blank page, and they
must not encode any particular industry.
