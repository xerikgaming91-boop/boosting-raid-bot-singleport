// src/server-admin.js
import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

import db from './db.js';
import { RaidSchema, RaidUpdateSchema, CharacterSchema } from './validators.js';
import { sessionMiddleware, requireRole, attachAuthRoutes } from './auth.js';
import { registerDiscordOAuth } from './oauth.js';
import { startBot, getBotStatus, client, postRaidEmbed, updateRaidEmbed, postRosterEmbed, updateRosterEmbed } from './bot.js';
import { makeTextChannelName, createTextChannel, renameTextChannel, deleteTextChannel } from './discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.argv.includes('--prod');
const isDev = !isProd;

const app = express();

// ---------- Security / Basics ----------
app.use(helmet({
  contentSecurityPolicy: isProd ? undefined : false,
  crossOriginEmbedderPolicy: false,
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: (_origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization'],
}));
app.options('*', cors());

// DEV CSP locker
if (isDev) {
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
        "style-src 'self' 'unsafe-inline'",
        "connect-src 'self' ws: wss:",
        "img-src 'self' data: blob:",
        "font-src 'self' data:"
      ].join('; ')
    );
    next();
  });
}

// ---------- Sessions & OAuth ----------
app.use(sessionMiddleware(process.env.WEB_SECRET || 'dev-secret'));
attachAuthRoutes(app);
registerDiscordOAuth(app);

// ---------- Health / Status ----------
app.get('/healthz', (_req, res) => res.json({ ok: true, ts: Date.now(), mode: isProd ? 'prod':'dev' }));
app.get('/status', (_req, res) => res.json({ ok: true, bot: getBotStatus() }));

// ---------- API: Raids ----------
app.get('/api/raids', (_req, res) => {
  const rows = db.prepare('SELECT * FROM raids ORDER BY date_iso DESC').all();
  res.json(rows);
});

app.get('/api/raids/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM raids WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ ok:false, error:'not found' });
  res.json(row);
});

app.get('/api/raids/:id/signups', (req, res) => {
  const signups = db.prepare(`
    SELECT s.*, c.name AS char_name, c.class AS char_class, u.display_name AS booster
    FROM signups s
    JOIN characters c ON s.character_id = c.id
    JOIN users u ON s.user_id = u.id
    WHERE s.raid_id = ?
    ORDER BY s.status DESC, s.created_at ASC
  `).all(req.params.id);
  res.json(signups);
});

// Verfügbare Charaktere (RL-Sicht)
app.get('/api/raids/:id/available-characters', (req, res) => {
  const raidId = Number(req.params.id);
  const rows = db.prepare(`
    SELECT c.* FROM characters c
    WHERE (c.locked_for_raid_id IS NULL OR c.locked_for_raid_id = @raidId)
      AND NOT EXISTS (
        SELECT 1 FROM signups s
        WHERE s.raid_id = @raidId AND s.character_id = c.id AND s.status = 'picked'
      )
  `).all({ raidId });
  res.json(rows);
});

// Pick / Unpick
app.post('/api/raids/:id/roster/pick', requireRole(['raidlead','admin']), async (req, res) => {
  const raidId = Number(req.params.id);
  const { signup_id } = req.body || {};
  const s = db.prepare('SELECT * FROM signups WHERE id = ? AND raid_id = ?').get(signup_id, raidId);
  if (!s) return res.status(400).json({ ok:false, error:'signup not found' });
  db.prepare('UPDATE signups SET status = ? WHERE id = ?').run('picked', signup_id);
  db.prepare('UPDATE characters SET locked_for_raid_id = ? WHERE id = ?').run(raidId, s.character_id);
  try { await updateRaidEmbed(raidId); await updateRosterEmbed(raidId); } catch {}
  res.json({ ok:true });
});

app.post('/api/raids/:id/roster/unpick', requireRole(['raidlead','admin']), async (req, res) => {
  const raidId = Number(req.params.id);
  const { signup_id } = req.body || {};
  const s = db.prepare('SELECT * FROM signups WHERE id = ? AND raid_id = ?').get(signup_id, raidId);
  if (!s) return res.status(400).json({ ok:false, error:'signup not found' });
  db.prepare('UPDATE signups SET status = ? WHERE id = ?').run('pending', signup_id);
  db.prepare('UPDATE characters SET locked_for_raid_id = NULL WHERE id = ?').run(s.character_id);
  try { await updateRaidEmbed(raidId); await updateRosterEmbed(raidId); } catch {}
  res.json({ ok:true });
});

// Raid erstellen -> Discord-Textchannel + Embeds
app.post('/api/raids', requireRole(['raidlead','admin']), async (req, res) => {
  try {
    const parsed = RaidSchema.parse(req.body);

    const info = db.prepare(
      'INSERT INTO raids (title, date_iso, size, description, loottype, difficulty) VALUES (?,?,?,?,?,?)'
    ).run(parsed.title, parsed.date_iso, parsed.size, parsed.description || '', parsed.loottype, parsed.difficulty);

    const raidId = info.lastInsertRowid;
    const chanName = makeTextChannelName(parsed.date_iso, parsed.loottype, parsed.difficulty);
    const guildId = process.env.DISCORD_GUILD_ID;
    if (!guildId) throw new Error('DISCORD_GUILD_ID fehlt (.env)');

    const textId = await createTextChannel(client, guildId, chanName);
    db.prepare('UPDATE raids SET text_channel_id=? WHERE id=?').run(textId, raidId);

    // Standard: direkt beides posten
    try {
      const msgId = await postRaidEmbed(raidId);
      const rosterId = await postRosterEmbed(raidId);
      console.log(`📣 Raid #${raidId} Embeds gepostet: announce=${msgId}, roster=${rosterId}`);
    } catch (e) {
      console.warn('Konnte Embeds nicht posten:', e.message || e);
    }

    res.json({ ok:true, id: raidId, channel_name: chanName, text_channel_id: textId });
  } catch (e) {
    res.status(400).json({ ok:false, error:String((e && e.message) ? e.message : e) });
  }
});

// 👇👇👇 NEW: Raid bearbeiten (PUT)
app.put('/api/raids/:id', requireRole(['raidlead','admin']), async (req, res) => {
  try {
    const raidId = Number(req.params.id);
    const existing = db.prepare('SELECT * FROM raids WHERE id = ?').get(raidId);
    if (!existing) return res.status(404).json({ ok:false, error:'raid not found' });

    const partial = RaidUpdateSchema.parse(req.body || {});
    const updated = {
      title: partial.title ?? existing.title,
      date_iso: partial.date_iso ?? existing.date_iso,
      size: partial.size ?? existing.size,
      description: partial.description ?? (existing.description || ''),
      loottype: partial.loottype ?? (existing.loottype || 'unsaved'),
      difficulty: partial.difficulty ?? (existing.difficulty || 'Normal'),
    };

    db.prepare(`
      UPDATE raids
      SET title=@title, date_iso=@date_iso, size=@size, description=@description, loottype=@loottype, difficulty=@difficulty
      WHERE id=@id
    `).run({ ...updated, id: raidId });

    // Discord-Channel ggf. umbenennen, wenn name-relevante Felder sich geändert haben
    if (existing.text_channel_id &&
        (existing.date_iso !== updated.date_iso ||
         existing.loottype !== updated.loottype ||
         existing.difficulty !== updated.difficulty)) {
      const newName = makeTextChannelName(updated.date_iso, updated.loottype, updated.difficulty);
      try { await renameTextChannel(client, existing.text_channel_id, newName); }
      catch(e){ console.warn('renameTextChannel failed:', e?.message || e) }
    }

    // Embeds aktualisieren
    try { await updateRaidEmbed(raidId); await updateRosterEmbed(raidId); } catch {}

    const after = db.prepare('SELECT * FROM raids WHERE id = ?').get(raidId);
    res.json(after);
  } catch (e) {
    res.status(400).json({ ok:false, error: String(e?.message || e) });
  }
});

// 👇👇👇 NEW: Raid löschen (DELETE)
app.delete('/api/raids/:id', requireRole(['raidlead','admin']), async (req, res) => {
  try {
    const raidId = Number(req.params.id);
    const delDiscord = (req.query.delete_discord ?? '1') !== '0';

    const raid = db.prepare('SELECT * FROM raids WHERE id = ?').get(raidId);
    if (!raid) return res.status(404).json({ ok:false, error:'raid not found' });

    // Discord-Kanal löschen (best effort)
    if (delDiscord && raid.text_channel_id) {
      try { await deleteTextChannel(client, raid.text_channel_id); }
      catch(e){ console.warn('deleteTextChannel failed:', e?.message || e) }
    }

    // Locks lösen + Signups löschen
    db.prepare('UPDATE characters SET locked_for_raid_id = NULL WHERE locked_for_raid_id = ?').run(raidId);
    db.prepare('DELETE FROM signups WHERE raid_id = ?').run(raidId);
    db.prepare('DELETE FROM raids WHERE id = ?').run(raidId);

    res.json({ ok:true, deleted: raidId });
  } catch (e) {
    res.status(400).json({ ok:false, error: String(e?.message || e) });
  }
});

// ---------- Discord aus Web (Roster/Announce) ----------
app.post('/api/raids/:id/discord/post-roster', requireRole(['raidlead','admin']), async (req, res) => {
  const raidId = Number(req.params.id);
  const raid = db.prepare('SELECT * FROM raids WHERE id = ?').get(raidId);
  if (!raid) return res.status(404).json({ ok:false, error:'raid not found' });
  if (!raid.text_channel_id) return res.status(400).json({ ok:false, error:'no discord text channel stored for this raid' });
  try {
    const msgId = await postRosterEmbed(raidId);
    return res.json({ ok:true, message_id: msgId });
  } catch(e){
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

app.post('/api/raids/:id/discord/refresh-roster', requireRole(['raidlead','admin']), async (req, res) => {
  const raidId = Number(req.params.id);
  try {
    await updateRosterEmbed(raidId);
    return res.json({ ok:true });
  } catch(e){
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

app.post('/api/raids/:id/discord/post-announce', requireRole(['raidlead','admin']), async (req, res) => {
  const raidId = Number(req.params.id);
  const raid = db.prepare('SELECT * FROM raids WHERE id = ?').get(raidId);
  if (!raid) return res.status(404).json({ ok:false, error:'raid not found' });
  if (!raid.text_channel_id) return res.status(400).json({ ok:false, error:'no discord text channel stored for this raid' });
  try {
    const msgId = await postRaidEmbed(raidId);
    return res.json({ ok:true, message_id: msgId });
  } catch(e){
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

app.post('/api/raids/:id/discord/refresh-announce', requireRole(['raidlead','admin']), async (req, res) => {
  const raidId = Number(req.params.id);
  try {
    await updateRaidEmbed(raidId);
    return res.json({ ok:true });
  } catch(e){
    return res.status(500).json({ ok:false, error: String(e.message || e) });
  }
});

// ---------- Frontend (Single-Port) ----------
const frontendRoot = path.join(__dirname, '..', 'frontend', 'admin');
const dist = path.join(frontendRoot, 'dist');

if (isDev) {
  const { createServer } = await import('vite');
  console.log('🔧 DEV: Vite-Middleware init – root =', frontendRoot);

  const vite = await createServer({
    root: frontendRoot,
    configFile: path.join(frontendRoot, 'vite.config.js'),
    server: { middlewareMode: true },
    appType: 'custom',
  });

  app.use(vite.middlewares);

  app.use('*', async (req, res, next) => {
    try {
      const url = req.originalUrl;
      let html = fs.readFileSync(path.join(frontendRoot, 'index.html'), 'utf-8');
      html = await vite.transformIndexHtml(url, html);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
} else {
  if (fs.existsSync(path.join(dist, 'index.html'))) {
    app.use(express.static(dist));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    console.warn('⚠️ Kein React-Build gefunden – bitte "npm run build:ui" ausführen.');
  }
}

// ---------- Errors ----------
app.use((err, _req, res, _next) => {
  console.error('UNHANDLED ERROR:', err);
  res.status(500).json({ ok:false, error:String((err && err.message) ? err.message : err) });
});

// ---------- Start ----------
const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🌐 Single-Port Server läuft auf http://localhost:${port} (${isProd ? 'prod' : 'dev'})`);
  startBot().then((st) => console.log('🤖 Bot-Status:', st));
});
