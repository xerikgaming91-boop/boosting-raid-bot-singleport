import { useEffect, useState } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'
import { api } from '../lib/api'
import Raids from '../pages/Raids'
import RaidDetail from '../pages/RaidDetail'
import Characters from '../pages/Characters'
import Login from '../pages/Login'

export default function App(){
  const [me, setMe] = useState(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await api.me()
        setMe(res.user || null)
      } catch {}
    })()
  }, [])

  return (
    <>
      <header className="nav">
        <div className="nav-left">
          {/* Brand führt zur Startseite (Raids-Liste) */}
          <NavLink to="/" end className="brand">Boosting Admin</NavLink>
          {/* 👇 Menüpunkt "Raids" entfernt */}
          <NavLink to="/characters" className="link">Characters</NavLink>
        </div>
        <div className="nav-right">
          {!me ? (
            <a href={api.authUrl} className="btn">Mit Discord anmelden</a>
          ) : (
            <NavLink to="/login" className="btn">
              {me.display_name} ({me.role})
            </NavLink>
          )}
        </div>
      </header>

      <main className="container">
        <Routes>
          {/* Startseite = Raids-Liste */}
          <Route path="/" element={<Raids />} />
          {/* Route /raids bleibt nutzbar, aber ohne Menüpunkt */}
          <Route path="/raids" element={<Raids />} />
          <Route path="/raids/:id" element={<RaidDetail />} />
          <Route path="/characters" element={<Characters />} />
          <Route path="/login" element={<Login />} />
        </Routes>
      </main>
    </>
  )
}
