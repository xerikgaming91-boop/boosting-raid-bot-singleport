import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../lib/api'

export default function Roster(){
  const { id } = useParams()
  const [raid, setRaid] = useState(null)
  const [signups, setSignups] = useState([])
  const [available, setAvailable] = useState([])
  const [me, setMe] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load(){
    try {
      setRaid(await api.raids.get(id))
      setSignups(await api.raids.signups(id))
      setAvailable(await api.raids.availableChars(id))
      const m = await api.me(); setMe(m.user || null)
    } catch (e){ setError(e.message) }
  }
  useEffect(() => { load() }, [id])

  const isRL = me && (me.role==='raidlead' || me.role==='admin')
  if (!isRL) {
    return (
      <div className="card">
        <h2>Kein Zugriff</h2>
        <p style={{opacity:.8}}>Dieses Roster-View ist nur für Raidlead/Admin sichtbar.</p>
      </div>
    )
  }

  const picked = useMemo(() => signups.filter(s => s.status === 'picked'), [signups])
  const grouped = useMemo(() => {
    const g = { tank:[], heal:[], melee:[], ranged:[] }
    for (const s of picked) g[s.role]?.push(s)
    return g
  }, [picked])
  const counts = useMemo(() => ({
    tank: grouped.tank.length,
    heal: grouped.heal.length,
    melee: grouped.melee.length,
    ranged: grouped.ranged.length,
    total: picked.length
  }), [grouped, picked])

  async function doUnpick(signup_id){
    setLoading(true)
    try {
      await api.raids.unpick(id, signup_id)
      await load()
    } catch(e){ setError(e.message) } finally { setLoading(false) }
  }

  if (!raid) return <div className="card">Lade… {error && <span style={{color:'#fca5a5'}}>{error}</span>}</div>

  return (
    <div className="row" style={{gap:16}}>
      <div className="card">
        <div style={{fontWeight:700, fontSize:18}}>{raid.title}</div>
        <div style={{opacity:.7,fontSize:12}}>{raid.date_iso} · Größe {raid.size}</div>
        <div style={{marginTop:8, display:'flex', gap:8}}>
          <span className="badge">{raid.difficulty || 'Normal'}</span>
          <span className="badge">{raid.loottype || 'unsaved'}</span>
        </div>
      </div>

      {/* Roster (picked only) */}
      <div className="card">
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center', marginBottom:8}}>
          <h3 style={{margin:0}}>Roster (Picked)</h3>
          <div className="badge">
            Tanks {counts.tank} · Heals {counts.heal} · Melee {counts.melee} · Ranged {counts.ranged} · Summe {counts.total}
          </div>
        </div>

        {counts.total === 0 ? (
          <div style={{opacity:.7}}>Noch keine Picks.</div>
        ) : (
          <>
            <RoleBlock title="Tanks" items={grouped.tank} onUnpick={doUnpick} loading={loading} />
            <RoleBlock title="Heals" items={grouped.heal} onUnpick={doUnpick} loading={loading} />
            <RoleBlock title="Melee" items={grouped.melee} onUnpick={doUnpick} loading={loading} />
            <RoleBlock title="Ranged" items={grouped.ranged} onUnpick={doUnpick} loading={loading} />
          </>
        )}
      </div>

      {/* Verfügbare Charaktere – nur Anzeige für RL */}
      <div className="card">
        <h3>Verfügbare Charaktere</h3>
        {available.length===0 && <div style={{opacity:.7}}>Keine freien Charaktere.</div>}
        <ul style={{listStyle:'none', padding:0, marginTop:8, display:'grid', gap:8}}>
          {available.map(c => (
            <li key={c.id} className="card" style={{padding:10}}>
              #{c.id} · {c.name} <span style={{opacity:.7}}>({c.class}/{c.role})</span> {c.locked_for_raid_id? '🔒':''}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

function RoleBlock({ title, items, onUnpick, loading }){
  if (!items || items.length===0) return null
  return (
    <div style={{marginTop:8}}>
      <div style={{fontWeight:700, marginBottom:8}}>{title} · {items.length}</div>
      <div className="row" style={{gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:8}}>
        {items.map(s => (
          <div className="card" key={s.id} style={{padding:12}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontWeight:600}}>{s.char_name} <span style={{opacity:.7}}>({s.char_class}/{s.role})</span></div>
                <div style={{opacity:.6, fontSize:12}}>{s.booster}</div>
              </div>
              <button className="btn" onClick={() => onUnpick(s.id)} disabled={loading}>Unpick</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
