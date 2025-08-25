import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../lib/api'

function buildTitle({ difficulty, loottype }) {
  return `${difficulty} • ${loottype}`;
}

export default function Raids(){
  const navigate = useNavigate()
  const [raids, setRaids] = useState([])
  const [me, setMe] = useState(null)
  const [raidleads, setRaidleads] = useState([])
  const [form, setForm] = useState({
    date_iso:'', loottype:'unsaved', difficulty:'Normal', raid_lead_user_id:''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [toast, setToast] = useState('')

  const previewTitle = useMemo(() => buildTitle(form), [form.difficulty, form.loottype])

  async function load(){
    try {
      setRaids(await api.raids.list())
      const m = await api.me(); setMe(m.user || null)
      setRaidleads(await api.discord.raidleads())
    } catch(e) { console.error(e) }
  }
  useEffect(() => { load() }, [])

  const isRL = me && (me.role==='raidlead' || me.role==='admin')

  if (!isRL) {
    return (
      <div className="card section">
        <h2 className="card-title">Raids</h2>
        <div className="card inset">
          <div className="card-title" style={{fontSize:16}}>Kein Zugriff</div>
          <p className="hint">Melde dich oben rechts mit Discord an, um Raids zu verwalten.</p>
        </div>
      </div>
    )
  }

  async function submit(e){
    e.preventDefault(); setLoading(true); setError('')
    try {
      const payload = { ...form, title: previewTitle }
      await api.raids.create(payload)
      setToast('Raid erstellt.')
      setForm({ date_iso:'', loottype:'unsaved', difficulty:'Normal', raid_lead_user_id:'' })
      await load()
    } catch(e){ setError(e.message) }
    finally { setLoading(false); setTimeout(()=>setToast(''), 2000) }
  }

  return (
    <div className="section">
      <div className="card">
        <form onSubmit={submit} className="row row-6" style={{alignItems:'end'}}>
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
            <button className="btn btn-primary" disabled={loading}>{loading ? 'Erstelle…' : 'Raid erstellen'}</button>
            <span className="chip">Titel: {previewTitle}</span>
            {toast && <span className="badge">{toast}</span>}
            {error && <span style={{color:'#fca5a5'}}>{error}</span>}
          </div>
        </form>
      </div>

      <div className="row" style={{gridTemplateColumns:'repeat(auto-fill,minmax(340px,1fr))'}}>
        {raids.map(r => (
          <div
            key={r.id}
            className="card raid-card"
            style={{cursor:'pointer'}}
            onClick={() => navigate('/raids/' + r.id)}
          >
            <div className="card-title">{r.title}</div>
            <div className="raid-meta">{r.date_iso}</div>
            <div className="chips" style={{marginTop:10}}>
              <span className="chip">{r.difficulty}</span>
              <span className="chip">{r.loottype}</span>
              {r.raid_lead_name && <span className="chip">RL: {r.raid_lead_name}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
