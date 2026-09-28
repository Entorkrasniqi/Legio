import BetterSqlite3, { type Database } from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseMigrationFiles, runMigrations, type Migration } from '../../src/main/db/migrate';
import { MIGRATIONS } from '../../src/main/db/migrations';

let db: Database;

beforeEach(() => {
  db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
});

afterEach(() => {
  db.close();
});

function tableNames(): string[] {
  return (
    db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as {
      name: string;
    }[]
  ).map((r) => r.name);
}

describe('parseMigrationFiles', () => {
  it('orders migrations by version', () => {
    const result = parseMigrationFiles({
      './002_second.sql': 'B',
      './001_first.sql': 'A',
    });
    expect(result.map((m) => m.version)).toEqual([1, 2]);
    expect(result.map((m) => m.name)).toEqual(['first', 'second']);
  });

  it('rejects a gap in numbering', () => {
    expect(() => parseMigrationFiles({ './001_a.sql': '', './003_c.sql': '' })).toThrow(/contiguously/);
  });

  it('rejects duplicate version numbers', () => {
    expect(() => parseMigrationFiles({ './001_a.sql': '', './001_b.sql': '' })).toThrow(/contiguously/);
  });

  it('rejects badly named files', () => {
    expect(() => parseMigrationFiles({ './initial.sql': '' })).toThrow(/Invalid migration file name/);
  });
});

describe('runMigrations', () => {
  it('migrates a fresh database to the full schema from docs/DOMAIN_MODEL.md', () => {
    const result = runMigrations(db, MIGRATIONS);
    expect(result.applied).toEqual(MIGRATIONS.map((m) => m.version));
    expect(tableNames()).toEqual(
      expect.arrayContaining([
        'approval_batches',
        'approvals',
        'channel_members',
        'channels',
        'companies',
        'connectors',
        'handoffs',
        'messages',
        'routine_runs',
        'routines',
        'schema_migrations',
        'skills',
        'tool_activity',
        'usage_ledger',
        'worker_browser_domains',
        'worker_connectors',
        'worker_handoff_targets',
        'worker_skills',
        'workers',
      ]),
    );
  });

  it('is idempotent: a second run applies nothing', () => {
    runMigrations(db, MIGRATIONS);
    const second = runMigrations(db, MIGRATIONS);
    expect(second.applied).toEqual([]);
  });

  it('applies only new migrations on an existing database', () => {
    const first: Migration[] = [{ version: 1, name: 'a', sql: 'CREATE TABLE a (id TEXT);' }];
    runMigrations(db, first);
    const result = runMigrations(db, [...first, { version: 2, name: 'b', sql: 'CREATE TABLE b (id TEXT);' }]);
    expect(result.applied).toEqual([2]);
    expect(tableNames()).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('rolls back a failing migration and records nothing for it', () => {
    const migrations: Migration[] = [
      { version: 1, name: 'ok', sql: 'CREATE TABLE ok (id TEXT);' },
      { version: 2, name: 'broken', sql: 'CREATE TABLE half (id TEXT); THIS IS NOT SQL;' },
    ];
    expect(() => runMigrations(db, migrations)).toThrow();
    expect(tableNames()).toContain('ok');
    expect(tableNames()).not.toContain('half');
    const versions = db.prepare('SELECT version FROM schema_migrations').all() as { version: number }[];
    expect(versions.map((v) => v.version)).toEqual([1]);
  });

  it('refuses to run when an applied migration was edited', () => {
    runMigrations(db, [{ version: 1, name: 'a', sql: 'CREATE TABLE a (id TEXT);' }]);
    expect(() => runMigrations(db, [{ version: 1, name: 'a', sql: 'CREATE TABLE a (id INTEGER);' }])).toThrow(
      /edited after being applied/,
    );
  });

  it('refuses to run an older build against a newer database', () => {
    runMigrations(db, [
      { version: 1, name: 'a', sql: 'CREATE TABLE a (id TEXT);' },
      { version: 2, name: 'b', sql: 'CREATE TABLE b (id TEXT);' },
    ]);
    expect(() => runMigrations(db, [{ version: 1, name: 'a', sql: 'CREATE TABLE a (id TEXT);' }])).toThrow(
      /doesn't know about/,
    );
  });

  it('enforces foreign keys in the initial schema', () => {
    runMigrations(db, MIGRATIONS);
    const insertWorker = db.prepare(
      `INSERT INTO workers (id, company_id, name, role, instructions_md, model, enabled_tools, created_at, updated_at)
       VALUES ('w1', 'missing-company', 'n', 'r', 'i', 'm', '[]', 'now', 'now')`,
    );
    expect(() => insertWorker.run()).toThrow(/FOREIGN KEY/);
  });
});
