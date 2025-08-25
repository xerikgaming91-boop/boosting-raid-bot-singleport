// src/db.js
import Database from 'better-sqlite3';

const db = new Database('data.sqlite');
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE,
  display_name TEXT,
  avatar TEXT,
  role TEXT CHECK(role IN ('booster','raidlead','admin')) NOT NULL DEFAULT 'booster'
);

CREATE TABLE IF NOT EXISTS characters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  class TEXT NOT NULL,
  role TEXT CHECK(role IN ('tank','heal','melee','ranged')) NOT NULL,
  ilvl INTEGER,
  notes TEXT,
  locked_for_raid_id INTEGER,
  UNIQUE(user_id, name),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS raids (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  date_iso TEXT NOT NULL,
  size INTEGER NOT NULL,
  description TEXT,
  loottype TEXT DEFAULT 'unsaved',
  difficulty TEXT DEFAULT 'Normal',
  discord_category_id TEXT,
  text_channel_id TEXT,
  voice_channel_id TEXT,
  announcement_message_id TEXT,
  roster_message_id TEXT
);

CREATE TABLE IF NOT EXISTS signups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  raid_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  character_id INTEGER NOT NULL,
  role TEXT CHECK(role IN ('tank','heal','melee','ranged')) NOT NULL,
  status TEXT CHECK(status IN ('pending','picked','withdrawn')) NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(raid_id, character_id),
  FOREIGN KEY(raid_id) REFERENCES raids(id),
  FOREIGN KEY(user_id) REFERENCES users(id),
  FOREIGN KEY(character_id) REFERENCES characters(id)
);
`);

try {
  const raidCols = db.prepare('PRAGMA table_info(raids)').all().map(c => c.name);
  if (!raidCols.includes('loottype')) db.exec("ALTER TABLE raids ADD COLUMN loottype TEXT DEFAULT 'unsaved'");
  if (!raidCols.includes('difficulty')) db.exec("ALTER TABLE raids ADD COLUMN difficulty TEXT DEFAULT 'Normal'");
  if (!raidCols.includes('announcement_message_id')) db.exec("ALTER TABLE raids ADD COLUMN announcement_message_id TEXT");
  if (!raidCols.includes('roster_message_id')) db.exec("ALTER TABLE raids ADD COLUMN roster_message_id TEXT");
} catch (e) {
  console.error('Migration check failed:', e);
}

export default db;
