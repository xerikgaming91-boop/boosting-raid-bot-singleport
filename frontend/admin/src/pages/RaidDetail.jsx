import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function buildTitle({ difficulty, loottype }) {
  return `${difficulty} • ${loottype}`;
}

export default function RaidDetail(){
  const { id } = useParams()
  const navigate = useNavigate()
  const [raid, setRaid] = useState(null)
  const [signups, setSignups] = useState([])
  const [me, setMe] = useState(null)
  const [raidleads, setRaidleads] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState('')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    date_iso:'', loottype:'unsaved', difficulty:'Normal', raid_lead_user_id:''
  })

  async function load(){
    try {
      const r = await api.raids.get(id)
      setRaid(r)
      setSignups(await api.raids.signups(id))
      const m = await api.me(); setMe(m.user || null)
      setRaidleads(await api.discord.raidleads())
      if (editing) setForm({
        date_iso: r.date_iso, loottype: r.loottype, difficulty: r.difficulty,
        raid_lead_user_id: r.raid_lead_user_id || ''
      })
    } catch (e){ setError(e.message) }
  }
  useEffect(() => { load() }, [id]) // eslint-disable-line

  const picked = useMemo(() => (signups || []).filter(s => s.status === 'picked'), [signups])
  const isRL = !!me && (me.role === 'raidlead' || me.role === 'admin')

  if (!isRL) {
    return <div className="card"><div className="card-title">Kein Zugriff</div></div>
  }

  function startEdit(){ setEditing(true) }
  function cancelEdit(){ setEditing(false); setError('') }
  async function saveEdit(e){
    e.preventDefault()
    try {
      await api.raids.update(id, { ...form, title: buildTitle(form) })
      setEditing(false); setToast('Raid gespeichert.')
      await load()
    } catch(err){ setError(err.message) }
  }

  async function deleteRaid(){
    if (!confirm('Raid löschen?')) return
    try { await api.raids.delete(id); navigate('/') } catch(err){ setError(err.message) }
  }

  if (!raid) return <div className="card">Lade…</div>

  return (
    <div className="card section">
      {!editing ? (
        <>
          <div className="card-title">{raid.title}</div>
          <div className="raid-meta">{raid.date_iso}</div>
          <div className="chips">
            <span className="chip">{raid.difficulty}</span>
            <span className="chip">{raid.loottype}</span>
            {raid.raid_lead_name && <span className="chip">RL: {raid.raid_lead_name}</span>}
          </div>
          <div className="toolbar">
            <button className="btn btn-outline" onClick={startEdit}>Bearbeiten</button>
            <button className="btn btn-danger" onClick={deleteRaid}>Löschen</button>
          </div>
          {toast && <span className="badge">{toast}</span>}
          {error && <span style={{color:'#fca5a5'}}>{error}</span>}
        </>
      ) : (
        <form onSubmit={saveEdit} className="row row-6" style={{alignItems:'end'}}>
          <div>
            <label className="small">Datum/Zeit</label>
            <input className="input" type="datetime-local" value={form.date_iso} onChange={e=>setForm(v=>({...v,date_iso:e.target.value}))} required />
          </div>
          <div>
            <label className="small">Loot-Type</label>
            <select className="input" value={form.loottype} onChange={e=>setForm(v=>({...v,loottype:e.target.value}))}>
              <option value="unsaved">unsaved</option>
              <option value="saved">saved</option>
              <option value="vip">vip</option>
            </select>
          </div>
          <div>
            <label className="small">Schwierigkeit</label>
            <select className="input" value={form.difficulty} onChange={e=>setForm(v=>({...v,difficulty:e.target.value}))}>
              <option value="Normal">Normal</option>
              <option value="Heroic">Heroic</option>
              <option value="Mythic">Mythic</option>
            </select>
          </div>
          <div>
            <label className="small">Raidlead</label>
            <select className="input" value={form.raid_lead_user_id} onChange={e=>setForm(v=>({...v,raid_lead_user_id:e.target.value}))} required>
              <option value="">-- auswählen --</option>
              {raidleads.map(u => (
                <option key={u.id} value={u.id}>{u.display_name}</option>
              ))}
            </select>
          </div>
          <div className="toolbar" style={{gridColumn:'1 / -1'}}>
            <button className="btn btn-primary">Speichern</button>
            <button type="button" className="btn btn-ghost" onClick={cancelEdit}>Abbrechen</button>
          </div>
        </form>
      )}
    </div>
  )
}
