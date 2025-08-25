import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Characters(){
  const [chars, setChars] = useState([])
  const [me, setMe] = useState(null)
  const [form, setForm] = useState({ name:'', class:'', role:'ranged', ilvl:'', notes:'' })
  const [error, setError] = useState('')

  async function load(){
    try {
      const m = await api.me(); setMe(m.user || null)
      if (m.user) setChars(await api.meChars.list())
    } catch(e){ setError(e.message) }
  }
  useEffect(() => { load() }, [])

  async function add(e){
    e.preventDefault(); setError('')
    try {
      await api.meChars.add({ ...form, ilvl: form.ilvl? Number(form.ilvl): undefined });
      setForm({ name:'', class:'', role:'ranged', ilvl:'', notes:'' });
      await load()
    } catch(e){ setError(e.message) }
  }

  return (
    <div className="card">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Charakter hinzufügen</h2>
        {/* Kein zusätzlicher Login-Button hier */}
        {me && <span style={{opacity:.7,fontSize:12}}>eingeloggt als {me.display_name} ({me.role})</span>}
      </div>

      {me ? (
        <form onSubmit={add} className="row row-6" style={{marginTop:12, alignItems:'end'}}>
          <input className="input" placeholder="Name" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} required />
          <input className="input" placeholder="Klasse" value={form.class} onChange={e=>setForm(v=>({...v,class:e.target.value}))} required />
          <select className="input" value={form.role} onChange={e=>setForm(v=>({...v,role:e.target.value}))}>
            <option value="tank">Tank</option>
            <option value="heal">Heal</option>
            <option value="melee">Melee</option>
            <option value="ranged">Ranged</option>
          </select>
          <input className="input" type="number" placeholder="iLvl" value={form.ilvl} onChange={e=>setForm(v=>({...v,ilvl:e.target.value}))} />
          <input className="input" placeholder="Notizen" value={form.notes} onChange={e=>setForm(v=>({...v,notes:e.target.value}))} />
          <button className="btn">Speichern</button>
          {error && <div style={{gridColumn:'1 / -1', color:'#fca5a5'}}>{error}</div>}
        </form>
      ) : (
        <div className="card" style={{marginTop:12}}>
          <div style={{fontWeight:600, marginBottom:6}}>Login erforderlich</div>
          <div style={{opacity:.8}}>
            Bitte <strong>oben rechts</strong> auf <em>„Mit Discord anmelden“</em> klicken.
          </div>
        </div>
      )}

      {me && (
        <div style={{marginTop:16}}>
          <h3>Meine Chars</h3>
          {chars.length===0 ? <div style={{opacity:.7}}>Noch keine Charaktere.</div> :
          <div className="row" style={{gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))'}}>
            {chars.map(c => (
              <div className="card" key={c.id}>
                <div style={{fontWeight:600}}>{c.name} <span style={{opacity:.7}}>({c.class}/{c.role})</span></div>
                <div style={{opacity:.7, fontSize:12}}>iLvl {c.ilvl || '—'} {c.locked_for_raid_id? '· 🔒 gelockt' : ''}</div>
                {c.notes && <p style={{marginTop:8}}>{c.notes}</p>}
              </div>
            ))}
          </div>}
        </div>
      )}
    </div>
  )
}
