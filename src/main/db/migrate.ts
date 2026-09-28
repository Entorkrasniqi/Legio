import { createHash } from 'node:crypto';
import type { Database } from 'better-sqlite3';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export interface MigrationResult {
  applied: number[];
  currentVersion: number;
}

const FILE_PATTERN = /^(\d{3,})_([a-z0-9_]+)\.sql$/;

/**
 * Turns `{ './migrations/001_initial.sql': '<sql>' }` (the shape produced by
 * Vite's import.meta.glob) into an ordered, validated migration list.
 * Versions must start at 1 and be contiguous, so a missing or duplicated file
 * fails loudly at startup instead of silently skipping a schema change.
 */
export function parseMigrationFiles(files: Record<string, string>): Migration[] {
  const migrations = Object.entries(files).map(([filePath, sql]) => {
    const fileName = filePath.split('/').pop() ?? filePath;
    const match = FILE_PATTERN.exec(fileName);
    if (!match?.[1] || !match[2]) {
      throw new Error(`Invalid migration file name: ${fileName} (expected NNN_name.sql)`);
    }
    return { version: Number(match[1]), name: match[2], sql };
  });
  migrations.sort((a, b) => a.version - b.version);
  migrations.forEach((m, i) => {
    if (m.version !== i + 1) {
      throw new Error(
        `Migrations must be numbered contiguously from 1; found ${m.version} at position ${i + 1}`,
      );
    }
  });
  return migrations;
}

function checksum(sql: string): string {
  return createHash('sha256').update(sql).digest('hex');
}

/**
 * Applies pending migrations, each in its own transaction, and records them in
 * `schema_migrations`. Also verifies that already-applied migrations have not
 * been edited since (checksum mismatch → throw): the fix for a bad migration
 * is a new migration, never an edit to an applied one.
 */
export function runMigrations(db: Database, migrations: Migration[]): MigrationResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version    INTEGER PRIMARY KEY,
      name       TEXT NOT NULL,
      checksum   TEXT NOT NULL,
      applied_at TEXT NOT NULL
    )
  `);

  const appliedRows = db
    .prepare('SELECT version, name, checksum FROM schema_migrations ORDER BY version')
    .all() as { version: number; name: string; checksum: string }[];
  const appliedByVersion = new Map(appliedRows.map((r) => [r.version, r]));

  for (const row of appliedRows) {
    const known = migrations.find((m) => m.version === row.version);
    if (!known) {
      throw new Error(
        `Database has migration ${row.version} (${row.name}) that this build doesn't know about — refusing to run an older app against a newer database`,
      );
    }
    if (checksum(known.sql) !== row.checksum) {
      throw new Error(`Migration ${row.version} (${row.name}) was edited after being applied`);
    }
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES (?, ?, ?, ?)',
  );
  const applied: number[] = [];
  for (const migration of migrations) {
    if (appliedByVersion.has(migration.version)) continue;
    db.transaction(() => {
      db.exec(migration.sql);
      insert.run(migration.version, migration.name, checksum(migration.sql), new Date().toISOString());
    })();
    applied.push(migration.version);
  }

  const last = migrations.at(-1);
  return { applied, currentVersion: last ? last.version : 0 };
}
