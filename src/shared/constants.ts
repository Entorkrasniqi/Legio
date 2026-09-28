/**
 * Display name used in UI copy and window titles. Renaming the app should be
 * a one-line change here (see CLAUDE.md).
 */
export const APP_NAME = 'Legio';

/**
 * Stable internal identifier. Deliberately separate from APP_NAME: it names
 * the on-disk data directory (and matches package.json `name`), so changing
 * the display name must NOT change this — otherwise the database and the
 * encrypted API key would be orphaned under the old directory.
 *
 * Note: Electron's safeStorage Keychain entry is derived from the app's
 * `productName` in package.json, which is also why that field must not be
 * edited as part of a display-name rename without a key-migration step.
 */
export const APP_ID = 'legio';

/** SQLite file name, inside the app's userData directory. */
export const DATABASE_FILE_NAME = `${APP_ID}.sqlite`;
