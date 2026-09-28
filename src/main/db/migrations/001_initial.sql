-- 001_initial: the full schema from docs/DOMAIN_MODEL.md, plus the minimum
-- indexes that doc lists. Later changes go in new numbered files; never edit
-- an applied migration.

CREATE TABLE companies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  description   TEXT,
  mission       TEXT,
  context_md    TEXT,
  workspace_dir TEXT NOT NULL,
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
  model             TEXT NOT NULL,
  enabled_tools     TEXT NOT NULL,
  code_execution_enabled INTEGER NOT NULL DEFAULT 0,
  code_execution_image   TEXT,
  browser_automation_enabled INTEGER NOT NULL DEFAULT 0,
  tts_enabled   INTEGER NOT NULL DEFAULT 0,
  tts_voice     TEXT,
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
  mentions      TEXT,
  run_id        TEXT,
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
  company_id    TEXT REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT NOT NULL,
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

CREATE TABLE approval_batches (
  id            TEXT PRIMARY KEY,
  worker_id     TEXT NOT NULL REFERENCES workers(id),
  company_id    TEXT NOT NULL REFERENCES companies(id),
  title         TEXT NOT NULL,
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
  batch_id      TEXT REFERENCES approval_batches(id),
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
  config_json  TEXT NOT NULL,
  created_at   TEXT NOT NULL
);

CREATE TABLE worker_connectors (
  worker_id    TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  connector_id TEXT NOT NULL REFERENCES connectors(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_id, connector_id)
);

CREATE TABLE worker_browser_domains (
  worker_id TEXT NOT NULL REFERENCES workers(id) ON DELETE CASCADE,
  domain    TEXT NOT NULL,
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
  cost_cents     REAL NOT NULL,
  created_at     TEXT NOT NULL
);

CREATE INDEX idx_messages_channel_created ON messages(channel_id, created_at);
CREATE INDEX idx_usage_company_created ON usage_ledger(company_id, created_at);
CREATE INDEX idx_usage_worker_created ON usage_ledger(worker_id, created_at);
CREATE INDEX idx_approvals_status ON approvals(status);
