import Database from 'better-sqlite3';

const db = new Database('data.sqlite');
const [discordId, role = 'raidlead'] = process.argv.slice(2);
if (!discordId) {
  console.log('Usage: node promote.mjs <DISCORD_ID> [raidlead|admin|booster]');
  process.exit(1);
}

let user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(discordId);
if (!user) {
  db.prepare('INSERT INTO users (discord_id, display_name, avatar, role) VALUES (?,?,?,?)')
    .run(discordId, 'Manual', null, role);
  console.log('User angelegt und befördert:', discordId, '->', role);
} else {
  db.prepare('UPDATE users SET role=? WHERE discord_id=?').run(role, discordId);
  console.log('User befördert:', discordId, '->', role);
}
