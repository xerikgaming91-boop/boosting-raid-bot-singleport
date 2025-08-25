// src/raid-embed.js
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
} from 'discord.js'

function toUnix(dateIso) {
  if (!dateIso) return null
  const t = Math.floor(new Date(dateIso).getTime() / 1000)
  return Number.isFinite(t) ? t : null
}

const ROLE_INFO = {
  tank:   { icon: '🛡️', label: 'Tanks'  },
  heal:   { icon: '✨', label: 'Heals'  },
  melee:  { icon: '⚔️', label: 'Melee'  },
  ranged: { icon: '🎯', label: 'Ranged' },
}

function summarizeNames(items, maxShown = 20) {
  const names = items.map(x => x.char_name || '??')
  if (names.length <= maxShown) return names.join(', ')
  const shown = names.slice(0, maxShown).join(', ')
  const more = names.length - maxShown
  return `${shown}, +${more} mehr`
}

function rosterFieldLines(grouped) {
  const lines = []
  for (const key of ['tank', 'heal', 'melee', 'ranged']) {
    const arr = grouped?.[key] || []
    if (arr.length === 0) continue
    const { icon, label } = ROLE_INFO[key]
    lines.push(`${icon} **${label} (${arr.length})**: ${summarizeNames(arr)}`)
  }
  return lines
}

// Haupt-Embed: Anmelde-Embed (inkl. Roster) – OHNE Größe
export function buildRaidEmbed(raid, counts, groupedPicked) {
  const ts = toUnix(raid.date_iso)
  const header = ts ? `📅 <t:${ts}:f>` : '📅 Termin tbd'
  const tags = `**${raid.difficulty || 'Normal'}** • **${raid.loottype || 'unsaved'}**`

  const descTop = [header, tags].filter(Boolean).join('\n')

  const picked = counts?.picked ?? 0
  const pending = counts?.pending ?? 0
  const statusLine = `Anmeldungen: **${pending}** pending · Picks: **${picked}**`

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(raid.title || `${raid.difficulty || 'Normal'} • ${raid.loottype || 'unsaved'}`)
    .setDescription(
      [
        descTop,
        raid.description ? `\n${raid.description}` : null,
        '\n' + statusLine
      ].filter(Boolean).join('\n')
    )

  const lines = rosterFieldLines(groupedPicked || {})
  if (lines.length > 0) {
    let value = lines.join('\n')
    if (value.length > 1024) value = value.slice(0, 1010) + ' …'
    embed.addFields({ name: '📋 Roster (Picked)', value })
  }

  return embed
}

// Separates Roster-Embed (optional) – OHNE Größe
export function buildRosterEmbed(raid, groupedPicked) {
  const ts = toUnix(raid.date_iso)
  const desc = ts ? `📅 <t:${ts}:f>` : undefined
  const embed = new EmbedBuilder()
    .setColor(0x00B894)
    .setTitle(`Roster – ${raid.title || 'Raid'}`)
  if (desc) embed.setDescription(desc)

  const lines = rosterFieldLines(groupedPicked || {})
  if (lines.length === 0) {
    embed.addFields({ name: 'Roster', value: 'Noch keine Picks.' })
  } else {
    let value = lines.join('\n')
    if (value.length > 1024) value = value.slice(0, 1010) + ' …'
    embed.addFields({ name: '📋 Roster (Picked)', value })
  }
  return embed
}

export function buildMainButtons(raidId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`raid:signup:${raidId}`)
      .setLabel('Anmelden')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`raid:withdraw:${raidId}`)
      .setLabel('Abmelden')
      .setStyle(ButtonStyle.Secondary),
  )
}

export function buildCharacterSelect(raidId, options) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`raid:select:${raidId}`)
      .setPlaceholder('Charakter auswählen…')
      .addOptions(options)
  )
}
