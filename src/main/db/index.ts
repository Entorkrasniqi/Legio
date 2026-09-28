import BetterSqlite3, { type Database } from 'better-sqlite3';
import { runMigrations, type MigrationResult } from './migrate';
import { MIGRATIONS } from './migrations';

export interface OpenedDatabase {
  db: Database;
  migration: MigrationResult;
}

/**
 * Opens (creating if needed) the app database and brings it to the latest
 * schema. Main process only — the renderer never gets a database handle
 * (docs/ARCHITECTURE.md).
 */
export function openDatabase(filePath: string): OpenedDatabase {
  const db = new BetterSqlite3(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  const migration = runMigrations(db, MIGRATIONS);
  return { db, migration };
}
