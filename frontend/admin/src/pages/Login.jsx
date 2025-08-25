// frontend/admin/src/pages/Login.jsx
import { useEffect, useState } from 'react'
import { api } from '../lib/api'

export default function Login() {
  const [me, setMe] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await api.me()
        setMe(res.user || null)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function doLogout(){
    await api.logout()
    window.location.href = '/'
  }

  if (loading) return <div className="card">Lade…</div>

  if (me) {
    return (
      <div className="card" style={{maxWidth:520}}>
        <h2>Du bist angemeldet</h2>
        <p style={{opacity:.8, marginTop:4}}>
          {me.display_name} ({me.role})
        </p>
        <div style={{display:'flex', gap:8, marginTop:12}}>
          <a className="btn" href="/">Zur Startseite</a>
          <button className="btn" onClick={doLogout}>Abmelden</button>
        </div>
      </div>
    )
  }

  return (
    <div className="card" style={{maxWidth:520}}>
      <h2>Mit Discord anmelden</h2>
      <p style={{opacity:.8, marginTop:4}}>
        Melde dich mit deinem Discord-Account an, um Raids zu verwalten.
      </p>

      {/* Variante A: echter Link (empfohlen) */}
      <a className="btn" href={api.authUrl} style={{marginTop:12}}>
        Mit Discord anmelden
      </a>

      {/* Variante B: falls du unbedingt einen <button> willst */}
      <button
        className="btn"
        style={{marginTop:8}}
        onClick={() => { window.location.href = api.authUrl }}
      >
        Mit Discord anmelden (Button)
      </button>
    </div>
  )
}
