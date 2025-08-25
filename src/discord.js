// src/discord.js
import { ChannelType, PermissionsBitField } from 'discord.js';

/** Name: tag-uhrzeit-loottype-difficulty (e.g. mo-2000-vip-mythic) */
export function makeTextChannelName(date_iso, loottype, difficulty) {
  const loot = String(loottype || 'unsaved').trim().toLowerCase().replace(/[^a-z]/g, '') || 'unsaved';
  const diff = String(difficulty || 'normal').trim().toLowerCase().replace(/[^a-z]/g, '') || 'normal';

  let day = 'mo', time = '0000';
  try {
    const d = new Date(date_iso);
    if (!Number.isNaN(d.getTime())) {
      const days = ['so','mo','di','mi','do','fr','sa'];
      day = days[d.getDay()] || 'mo';
      const hh = String(d.getHours()).padStart(2,'0');
      const mm = String(d.getMinutes()).padStart(2,'0');
      time = `${hh}${mm}`;
    }
  } catch {}
  return `${day}-${time}-${loot}-${diff}`;
}

async function makeUniqueName(guild, baseName) {
  await guild.channels.fetch();
  let name = baseName, i = 2;
  const exists = () => guild.channels.cache.some(c => c.type === ChannelType.GuildText && c.name === name);
  while (exists()) name = `${baseName}-${i++}`;
  return name;
}

/** Only one text channel, no category/voice – mit Bot-Overwrites */
export async function createTextChannel(client, guildId, desiredName) {
  const guild = await client.guilds.fetch(guildId);
  const me = guild.members.me;

  const need = [
    PermissionsBitField.Flags.ManageChannels,
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.EmbedLinks,
    PermissionsBitField.Flags.ReadMessageHistory,
  ];
  const missing = need.filter(p => !me.permissions.has(p));
  if (missing.length) {
    const list = missing.map(v => (PermissionsBitField.Flags[v] ? v : String(v))).join(', ');
    throw new Error(`Bot-Rechte fehlen (Serverweit): ${list}.`);
  }

  const name = await makeUniqueName(guild, desiredName);
  const text = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    reason: 'Raid Textchannel (auto)',
    permissionOverwrites: [
      {
        id: me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.EmbedLinks,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ],
  });

  if (text.name !== name) await text.setName(name, 'Enforce naming');
  return text.id;
}

/** Textchannel sicher umbenennen (vermeidet Kollisionen) */
export async function renameTextChannel(client, channelId, desiredName) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || channel.type !== ChannelType.GuildText) return false;

  const guild = await channel.guild.fetch();
  const unique = await makeUniqueName(guild, desiredName);
  if (channel.name === unique) return true;

  await channel.setName(unique, 'Raid-Änderung (Datum/Loot/Difficulty)');
  return true;
}

/** Textchannel löschen (best effort) */
export async function deleteTextChannel(client, channelId) {
  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel) return false;
    await channel.delete('Raid gelöscht');
    return true;
  } catch { return false; }
}
