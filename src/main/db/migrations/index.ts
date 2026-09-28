import { parseMigrationFiles, type Migration } from '../migrate';

/**
 * Every `NNN_name.sql` file in this folder, inlined into the main bundle at
 * build time so packaged builds never depend on reading SQL files from disk.
 */
const files = import.meta.glob<string>('./*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const MIGRATIONS: Migration[] = parseMigrationFiles(files);
