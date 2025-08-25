import express from 'express'
import db from './db.js'
import { client } from './bot.js'

const router = express.Router()

async function fetchDiscordRaidLeads() {
  const guildId = process.env.DISCORD_GUILD_ID
  const roleId  = process.env.DISCORD_RAIDLEAD_ROLE_ID
  if (!guildId || !roleId || !client?.isReady?.()) return null
  try {
    const guild = await client.guilds.fetch(guildId)
    await guild.members.fetch()
    const role = guild.roles.cache.get(roleId)
    if (!role) return null

    const upsert = db.prepare(`
      INSERT INTO users (discord_id, display_name, role)
      VALUES (?, ?, 'raidlead')
      ON CONFLICT(discord_id) DO UPDATE SET display_name=excluded.display_name
    `)
    const select = db.prepare('SELECT id, display_name, discord_id FROM users WHERE discord_id=?')

    const out = []
    for (const m of role.members.values()) {
      const display = m.displayName || m.user.globalName || m.user.username
      upsert.run(m.id, display)
      out.push(select.get(m.id))
    }
    return out
  } catch (e) {
    console.error('fetchDiscordRaidLeads error:', e?.message || e)
    return null
  }
}

router.get('/api/discord/raidleads', async (_req, res) => {
  const fromDiscord = await fetchDiscordRaidLeads()
  if (fromDiscord && fromDiscord.length) return res.json(fromDiscord)
  const rows = db.prepare("SELECT id, display_name, discord_id FROM users WHERE role IN ('raidlead','admin') ORDER BY display_name").all()
  return res.json(rows)
})

export default router
