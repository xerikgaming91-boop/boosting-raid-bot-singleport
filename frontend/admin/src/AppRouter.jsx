import React from 'react'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import './styles.css'
import App from './shell/App'
import Raids from './pages/Raids'
import RaidDetail from './pages/RaidDetail'
import Characters from './pages/Characters'
import Login from './pages/Login'

const router = createBrowserRouter([
  { path: '/', element: <App />, children: [
      { index: true, element: <Raids /> },
      { path: 'raids/:id', element: <RaidDetail /> },
      { path: 'characters', element: <Characters /> },
      { path: 'login', element: <Login /> },
  ] }
])

export default function AppRouter(){
  return <RouterProvider router={router} fallbackElement={<div style={{padding:16}}>Lade…</div>} />
}
