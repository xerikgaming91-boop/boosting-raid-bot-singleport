// src/bot.js
import 'dotenv/config';
import {
  Client,
  GatewayIntentBits,
  Events,
  PermissionsBitField,
} from 'discord.js';
import db from './db.js';
import {
  buildRaidEmbed,
  buildMainButtons,
  buildRosterEmbed,
  buildCharacterSelect,
} from './raid-embed.js';

const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';

function getCleanToken() {
  const raw = (process.env.DISCORD_TOKEN || '').trim();
  return raw.replace(/^Bot\s+/i, '');
}

// ⬇️ GuildMembers-Intent wichtig für einige Checks/Login-Mapping (harmlos für Buttons)
export const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
});

let lastStatus = { ok: false, reason: 'not started' };

client.once(Events.ClientReady, async (c) => {
  console.log(`✅ Discord bot eingeloggt als ${c.user.tag}`);
  lastStatus = { ok: true };
});

// ---- Robust logging
process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION:', err);
});

export async function startBot() {
  const token = getCleanToken();
  if (!token || token === 'YOUR_BOT_TOKEN_NO_PREFIX') {
    console.warn('⚠️  DISCORD_TOKEN fehlt/Platzhalter – Bot-Login wird übersprungen.');
    lastStatus = { ok: false, reason: 'missing token' };
    return lastStatus;
  }
  try {
    await client.login(token);
    lastStatus = { ok: true };
  } catch (e) {
    console.error('⚠️  Discord-Login fehlgeschlagen:', e?.code || e?.message || e);
    lastStatus = { ok: false, reason: String(e?.message || e) };
  }
  return lastStatus;
}

export function getBotStatus() { return lastStatus; }

// ---------- Helpers ----------
const NEED_PERMS = [
  PermissionsBitField.Flags.ViewChannel,
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.EmbedLinks,
  PermissionsBitField.Flags.ReadMessageHistory,
];

function namesFor(flags) {
  return flags.map((f) => Object.entries(PermissionsBitField.Flags).find(([_, v]) => v === f)?.[0] || String(f));
}

async function ensureSendableInChannel(channel) {
  const me = channel.guild.members.me;
  const perms = channel.permissionsFor(me);
  if (!perms) throw new Error('Konnte Kanalrechte nicht ermitteln.');
  const missing = NEED_PERMS.filter((f) => !perms.has(f));
  if (missing.length) throw new Error('Fehlende Kanalrechte: ' + namesFor(missing).join(', '));
}

function raidCounts(raidId) {
  const picked = db.prepare("SELECT COUNT(*) AS c FROM signups WHERE raid_id=? AND status='picked'").get(raidId).c || 0;
  const pending = db.prepare("SELECT COUNT(*) AS c FROM signups WHERE raid_id=? AND status='pending'").get(raidId).c || 0;
  return { picked, pending };
}

function pickedGrouped(raidId) {
  const rows = db.prepare(`
    SELECT s.id, s.role, c.name AS char_name, c.class AS char_class, u.display_name AS booster
    FROM signups s
    JOIN characters c ON c.id = s.character_id
    JOIN users u ON u.id = s.user_id
    WHERE s.raid_id = ? AND s.status = 'picked'
    ORDER BY s.role, c.name
  `).all(raidId);
  const g = { tank:[], heal:[], melee:[], ranged:[] };
  for (const r of rows) (g[r.role] ??= []).push(r);
  return g;
}

// ---------- Raid-Embed (mit Roster im selben Embed) ----------
export async function postRaidEmbed(raidId) {
  const raid = db.prepare('SELECT * FROM raids WHERE id=?').get(raidId);
  if (!raid) throw new Error('Raid nicht gefunden');
  if (!raid.text_channel_id) throw new Error('Raid hat keinen Textchannel');

  try {
    const channel = await client.channels.fetch(raid.text_channel_id);
    await ensureSendableInChannel(channel);
    const embed = buildRaidEmbed(raid, raidCounts(raidId), pickedGrouped(raidId));
    const components = [buildMainButtons(raidId)];
    const msg = await channel.send({ content: '📣 **Raid-Anmeldung** – nutze die Buttons unten.', embeds: [embed], components });
    db.prepare('UPDATE raids SET announcement_message_id=? WHERE id=?').run(msg.id, raidId);
    return msg.id;
  } catch (err) {
    console.error('postRaidEmbed error:', err?.message || err);
    try { console.dir(err, { depth: 5 }); } catch {}
    throw new Error('Discord API Fehler beim Posten des Embeds');
  }
}

export async function updateRaidEmbed(raidId) {
  const raid = db.prepare('SELECT * FROM raids WHERE id=?').get(raidId);
  if (!raid || !raid.text_channel_id) return false;

  try {
    const channel = await client.channels.fetch(raid.text_channel_id);
    await ensureSendableInChannel(channel);
    const embed = buildRaidEmbed(raid, raidCounts(raidId), pickedGrouped(raidId));
    const components = [buildMainButtons(raidId)];
    if (raid.announcement_message_id) {
      const msg = await channel.messages.fetch(raid.announcement_message_id).catch(() => null);
      if (msg) { await msg.edit({ embeds: [embed], components }); return true; }
    }
    const newMsg = await channel.send({ content: '📣 **Raid-Anmeldung (aktualisiert)**', embeds: [embed], components });
    db.prepare('UPDATE raids SET announcement_message_id=? WHERE id=?').run(newMsg.id, raidId);
    return true;
  } catch (err) {
    console.error('updateRaidEmbed error:', err?.message || err);
    try { console.dir(err, { depth: 5 }); } catch {}
    return false;
  }
}

// ---------- Roster-Embed (separat; optional zusätzlich) ----------
export async function postRosterEmbed(raidId) {
  const raid = db.prepare('SELECT * FROM raids WHERE id=?').get(raidId);
  if (!raid) throw new Error('Raid nicht gefunden');
  if (!raid.text_channel_id) throw new Error('Raid hat keinen Textchannel');

  try {
    const channel = await client.channels.fetch(raid.text_channel_id);
    await ensureSendableInChannel(channel);
    const embed = buildRosterEmbed(raid, pickedGrouped(raidId));
    const msg = await channel.send({ embeds: [embed] });
    db.prepare('UPDATE raids SET roster_message_id=? WHERE id=?').run(msg.id, raidId);
    return msg.id;
  } catch (err) {
    console.error('postRosterEmbed error:', err?.message || err);
    try { console.dir(err, { depth: 5 }); } catch {}
    throw new Error('Discord API Fehler beim Posten des Roster-Embeds');
  }
}

export async function updateRosterEmbed(raidId) {
  const raid = db.prepare('SELECT * FROM raids WHERE id=?').get(raidId);
  if (!raid || !raid.text_channel_id) return false;

  try {
    const channel = await client.channels.fetch(raid.text_channel_id);
    await ensureSendableInChannel(channel);
    const embed = buildRosterEmbed(raid, pickedGrouped(raidId));
    if (raid.roster_message_id) {
      const msg = await channel.messages.fetch(raid.roster_message_id).catch(() => null);
      if (msg) { await msg.edit({ embeds: [embed] }); return true; }
    }
    const newMsg = await channel.send({ embeds: [embed] });
    db.prepare('UPDATE raids SET roster_message_id=? WHERE id=?').run(newMsg.id, raidId);
    return true;
  } catch (err) {
    console.error('updateRosterEmbed error:', err?.message || err);
    try { console.dir(err, { depth: 5 }); } catch {}
    return false;
  }
}

// ---------- Interactions (Buttons & Select) ----------
client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isButton()) {
      console.log('[INT] Button:', interaction.customId, 'by', interaction.user?.id);
      const [ns, action, raidIdStr] = interaction.customId.split(':');
      if (ns !== 'raid') return;
      const raidId = Number(raidIdStr);

      if (action === 'signup') {
        await interaction.deferReply({ ephemeral: true });

        // User record
        let user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
        if (!user) {
          const info = db.prepare('INSERT INTO users (discord_id, display_name, avatar, role) VALUES (?,?,?,?)')
            .run(interaction.user.id, interaction.user.globalName || interaction.user.username, null, 'booster');
          user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
        }

        // verfügbare Charaktere
        const chars = db.prepare(`
          SELECT c.*
          FROM characters c
          WHERE c.user_id=@uid
            AND (c.locked_for_raid_id IS NULL OR c.locked_for_raid_id=@rid)
            AND NOT EXISTS (
              SELECT 1 FROM signups s
              WHERE s.raid_id=@rid AND s.character_id=c.id AND s.status IN ('pending','picked')
            )
          ORDER BY c.name
        `).all({ uid: user.id, rid: raidId });

        if (chars.length === 0) {
          const url = `${PUBLIC_BASE_URL}/characters`;
          return interaction.editReply({
            content: `Du hast derzeit **keine verfügbaren Charaktere**.\n➡️ Lege welche im Web an: ${url}`,
          });
        }

        const opts = chars.slice(0, 25).map(c => ({
          label: `${c.name} (${c.class}/${c.role})`,
          value: String(c.id),
          description: c.notes ? c.notes.slice(0, 90) : undefined
        }));

        return interaction.editReply({
          content: 'Wähle den Charakter für diesen Raid:',
          components: [buildCharacterSelect(raidId, opts)],
        });
      }

      if (action === 'withdraw') {
        await interaction.deferReply({ ephemeral: true });

        let user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
        if (!user) {
          const info = db.prepare('INSERT INTO users (discord_id, display_name, avatar, role) VALUES (?,?,?,?)')
            .run(interaction.user.id, interaction.user.globalName || interaction.user.username, null, 'booster');
          user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
        }
        const pend = db.prepare(`SELECT id FROM signups WHERE user_id=? AND raid_id=? AND status='pending'`).all(user.id, Number(raidId));
        if (pend.length === 0) return interaction.editReply({ content: 'Du hast keine offenen Anmeldungen.' });

        const stmt = db.prepare("UPDATE signups SET status='withdrawn' WHERE id=?");
        for (const s of pend) stmt.run(s.id);

        await updateRaidEmbed(raidId);   // 👈 auto-refresh Anmelde-Embed inkl. Roster
        await updateRosterEmbed(raidId); // (optional) separates Roster-Embed
        return interaction.editReply({ content: `Abgemeldet (${pend.length}).` });
      }
    }

    if (interaction.isStringSelectMenu()) {
      console.log('[INT] Select:', interaction.customId, 'val=', interaction.values);
      const [ns, action, raidIdStr] = interaction.customId.split(':');
      if (ns !== 'raid' || action !== 'select') return;
      const raidId = Number(raidIdStr);
      const charId = Number(interaction.values[0]);

      await interaction.deferReply({ ephemeral: true });

      let user = db.prepare('SELECT * FROM users WHERE discord_id=?').get(interaction.user.id);
      if (!user) {
        const info = db.prepare('INSERT INTO users (discord_id, display_name, avatar, role) VALUES (?,?,?,?)')
          .run(interaction.user.id, interaction.user.globalName || interaction.user.username, null, 'booster');
        user = db.prepare('SELECT * FROM users WHERE id=?').get(info.lastInsertRowid);
      }

      const char = db.prepare('SELECT * FROM characters WHERE id=? AND user_id=?').get(charId, user.id);
      if (!char) return interaction.editReply({ content: 'Charakter nicht gefunden oder gehört dir nicht.' });

      const already = db.prepare(`SELECT 1 FROM signups WHERE raid_id=? AND character_id=? AND status IN ('pending','picked')`).get(raidId, charId);
      if (already) return interaction.editReply({ content: 'Dieser Charakter ist bereits angemeldet.' });
      if (char.locked_for_raid_id && char.locked_for_raid_id !== raidId) {
        return interaction.editReply({ content: 'Dieser Charakter ist für einen anderen Raid gelockt.' });
      }

      try {
        db.prepare('INSERT INTO signups (raid_id, user_id, character_id, role, status) VALUES (?,?,?,?,?)')
          .run(raidId, user.id, charId, char.role, 'pending');
      } catch {
        return interaction.editReply({ content: 'Konnte Anmeldung nicht speichern (evtl. doppelt).' });
      }

      await updateRaidEmbed(raidId);   // 👈 auto-refresh Anmelde-Embed inkl. Roster
      await updateRosterEmbed(raidId); // (optional) separates Roster-Embed
      return interaction.editReply({ content: `Angemeldet mit **${char.name}**.` });
    }
  } catch (err) {
    console.error('Interaction error:', err?.message || err);
    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ ephemeral: true, content: `Fehler: ${String(err.message || err)}` });
      } else {
        await interaction.reply({ ephemeral: true, content: `Fehler: ${String(err.message || err)}` });
      }
    } catch {}
  }
});
