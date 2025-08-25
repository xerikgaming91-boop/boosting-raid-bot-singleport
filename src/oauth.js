// src/oauth.js
import db from './db.js';
import { client } from './bot.js';
import { PermissionsBitField } from 'discord.js';

const DISCORD_CLIENT_ID = (process.env.DISCORD_CLIENT_ID || '').trim();
const DISCORD_CLIENT_SECRET = (process.env.DISCORD_CLIENT_SECRET || '').trim();
const DISCORD_REDIRECT_URL = (process.env.DISCORD_REDIRECT_URL || 'http://localhost:3000/auth/discord/callback').trim();

const DISCORD_GUILD_ID = (process.env.DISCORD_GUILD_ID || '').trim();
const ROLE_ADMIN_IDS = (process.env.ROLE_ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const ROLE_RAIDLEAD_IDS = (process.env.ROLE_RAIDLEAD_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
const BOOTSTRAP_ADMIN_DISCORD_ID = (process.env.BOOTSTRAP_ADMIN_DISCORD_ID || '').trim();

const OAUTH_DISABLE_STATE_CHECK = (process.env.OAUTH_DISABLE_STATE_CHECK === '1');

function logAuth(step, extra = {}) {
  const safe = { ...extra };
  if (safe.token) delete safe.token;
  console.log(`[oauth] ${step}`, safe);
}

function oauthAuthorizeUrl(state) {
  const params = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: DISCORD_REDIRECT_URL,
    scope: 'identify',
    state,
    prompt: 'consent', // stabiler als 'none' beim ersten Login
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

async function exchangeCodeForToken(code) {
  const body = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID,
    client_secret: DISCORD_CLIENT_SECRET,
    grant_type: 'authorization_code',
    code,
    redirect_uri: DISCORD_REDIRECT_URL,
  });
  const r = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`token exchange failed ${r.status}: ${txt}`);
  }
  return r.json();
}

async function getDiscordUser(access_token) {
  const r = await fetch('https://discord.com/api/users/@me', {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`get /users/@me failed ${r.status}: ${txt}`);
  }
  return r.json(); // { id, username, global_name, ... }
}

export async function resolveRoleFromGuild(discordId) {
  try {
    if (!DISCORD_GUILD_ID) return 'booster';
    const guild = await client.guilds.fetch(DISCORD_GUILD_ID);

    if (guild.ownerId && guild.ownerId === discordId) {
      logAuth('map role: owner -> admin', { discordId });
      return 'admin';
    }

    // Benötigt SERVER MEMBERS INTENT in der Bot-App + GuildMembers-Intent im Client.
    const member = await guild.members.fetch(discordId);
    const roleIds = member.roles.cache.map(r => r.id);
    const hasAdminPerm = member.permissions.has(PermissionsBitField.Flags.Administrator);

    logAuth('map role: member fetched', { discordId, roleIds, hasAdminPerm });

    if (BOOTSTRAP_ADMIN_DISCORD_ID && BOOTSTRAP_ADMIN_DISCORD_ID === discordId) return 'admin';
    if (hasAdminPerm || ROLE_ADMIN_IDS.some(id => roleIds.includes(id))) return 'admin';
    if (ROLE_RAIDLEAD_IDS.some(id => roleIds.includes(id))) return 'raidlead';
    return 'booster';
  } catch (e) {
    logAuth('map role failed', { discordId, error: e?.message || String(e) });
    if (BOOTSTRAP_ADMIN_DISCORD_ID && BOOTSTRAP_ADMIN_DISCORD_ID === discordId) return 'admin';
    return 'booster';
  }
}

export function registerDiscordOAuth(app) {
  // Debug-Route: zeigt Config/Session grob an
  app.get('/auth/discord/debug', (req, res) => {
    res.json({
      ok: true,
      env: {
        has_client_id: !!DISCORD_CLIENT_ID,
        has_client_secret: !!DISCORD_CLIENT_SECRET,
        redirect_url: DISCORD_REDIRECT_URL,
        guild_id: DISCORD_GUILD_ID || null,
      },
      session: {
        has_session: !!req.session,
        oauth_state: req.session?.oauth_state || null,
        user: req.session?.user || null,
      },
    });
  });

  // Start: State setzen und SICHER speichern, dann redirect
  app.get('/auth/discord', (req, res) => {
    const state = Math.random().toString(36).slice(2);
    if (req.session) req.session.oauth_state = state;
    logAuth('start', { state, redirect: DISCORD_REDIRECT_URL });

    // WICHTIG: Session vor Redirect speichern
    if (req.session?.save) {
      req.session.save(() => res.redirect(oauthAuthorizeUrl(state)));
    } else {
      res.redirect(oauthAuthorizeUrl(state));
    }
  });

  // Callback
  app.get('/auth/discord/callback', async (req, res) => {
    const { code, state, error } = req.query;
    logAuth('callback-hit', { code: !!code, state, error });

    try {
      if (error) throw new Error(String(error));
      if (!code) throw new Error('missing code');

      // State prüfen (optional abschaltbar)
      if (!OAUTH_DISABLE_STATE_CHECK) {
        const expected = req.session?.oauth_state;
        if (!expected) throw new Error('state missing from session (cookie?)');
        if (state !== expected) throw new Error(`state mismatch (got=${state}, expected=${expected})`);
      }

      const token = await exchangeCodeForToken(String(code));
      logAuth('token-ok');

      const me = await getDiscordUser(token.access_token);
      logAuth('user-ok', { discord_id: me.id });

      const display = me.global_name || me.username || `user-${me.id}`;
      const role = await resolveRoleFromGuild(me.id);

      const existing = db.prepare('SELECT * FROM users WHERE discord_id = ?').get(me.id);
      if (existing) {
        db.prepare('UPDATE users SET display_name=?, avatar=?, role=? WHERE discord_id=?')
          .run(display, me.avatar || null, role, me.id);
      } else {
        db.prepare('INSERT INTO users (discord_id, display_name, avatar, role) VALUES (?,?,?,?)')
          .run(me.id, display, me.avatar || null, role);
      }

      // Session setzen
      if (req.session) {
        req.session.user = { discord_id: me.id, display_name: display, role };
        // sofort speichern, um Edge-Fälle zu vermeiden
        return req.session.save(() => res.redirect('/'));
      }
      // Fallback
      return res.redirect('/');
    } catch (e) {
      const msg = String(e?.message || e);
      console.error('OAuth callback error:', msg);
      res
        .status(500)
        .send(
          `<pre>OAuth Fehler:\n${msg}\n\n` +
          `Tipps:\n` +
          `- Redirect URL exakt wie in .env und im Discord Developer Portal\n` +
          `- Host exakt gleich benutzen (localhost vs. 127.0.0.1)\n` +
          `- Cookies nicht blockieren\n` +
          `\nDebug: GET /auth/discord/debug</pre>`
        );
    }
  });
}
