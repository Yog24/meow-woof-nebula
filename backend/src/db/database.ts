import { mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export function createDatabase(databasePath: string): DatabaseSync {
  const absolutePath = path.resolve(process.cwd(), databasePath);
  mkdirSync(path.dirname(absolutePath), { recursive: true });

  const db = new DatabaseSync(absolutePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      open_id TEXT NOT NULL UNIQUE,
      nick_name TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      session_id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      access_token TEXT NOT NULL UNIQUE,
      refresh_token TEXT NOT NULL UNIQUE,
      access_expires_at INTEGER NOT NULL,
      refresh_expires_at INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_assets (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      data_url TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_tasks (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      asset_id TEXT NOT NULL,
      pet_type TEXT NOT NULL,
      status TEXT NOT NULL,
      output_size INTEGER NOT NULL,
      style_preset TEXT NOT NULL,
      preserve_traits INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      started_at TEXT,
      completed_at TEXT,
      failed_at TEXT,
      result_id TEXT,
      error_message TEXT,
      source_filename TEXT NOT NULL,
      reference_asset_ids TEXT,
      source_filenames TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (asset_id) REFERENCES image_assets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS image_results (
      id TEXT PRIMARY KEY,
      task_id TEXT NOT NULL UNIQUE,
      user_id TEXT NOT NULL,
      image_url TEXT NOT NULL,
      width INTEGER NOT NULL,
      height INTEGER NOT NULL,
      model TEXT NOT NULL,
      style_preset TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (task_id) REFERENCES image_tasks(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS social_whispers (
      id TEXT PRIMARY KEY,
      author_user_id TEXT NOT NULL,
      pet_id TEXT,
      text TEXT NOT NULL,
      image_url TEXT,
      date_key TEXT,
      time_label TEXT,
      location_id TEXT,
      location_name TEXT,
      activity_type TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whisper_likes (
      whisper_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (whisper_id, user_id),
      FOREIGN KEY (whisper_id) REFERENCES social_whispers(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS whisper_comments (
      id TEXT PRIMARY KEY,
      whisper_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (whisper_id) REFERENCES social_whispers(id) ON DELETE CASCADE,
      FOREIGN KEY (author_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS friend_requests (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL,
      to_user_id TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      responded_at TEXT,
      FOREIGN KEY (from_user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (to_user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  addColumnIfMissing(db, "image_tasks", "reference_asset_ids", "TEXT");
  addColumnIfMissing(db, "image_tasks", "source_filenames", "TEXT");
  addColumnIfMissing(db, "social_whispers", "date_key", "TEXT");
  addColumnIfMissing(db, "social_whispers", "time_label", "TEXT");
  addColumnIfMissing(db, "social_whispers", "location_id", "TEXT");
  addColumnIfMissing(db, "social_whispers", "location_name", "TEXT");
  addColumnIfMissing(db, "social_whispers", "activity_type", "TEXT");

  return db;
}

function addColumnIfMissing(
  db: DatabaseSync,
  tableName: string,
  columnName: string,
  columnType: string,
): void {
  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
    name: string;
  }>;
  if (columns.some((column) => column.name === columnName)) return;
  db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnType}`);
}
