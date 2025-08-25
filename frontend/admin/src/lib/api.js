const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function http(method, url, body){
  const res = await fetch(url, {
    method,
    credentials: 'include',
    headers: JSON_HEADERS,
    body: body ? JSON.stringify(body) : undefined
  })
  if (!res.ok) {
    let msg = `HTTP ${res.status}`
    try { const j = await res.json(); msg = j.error || j.message || msg } catch {}
    throw new Error(msg)
  }
  return res.status === 204 ? null : res.json()
}

export const api = {
  me() { return http('GET','/api/me') },
  discord: {
    raidleads() { return http('GET','/api/discord/raidleads') }
  },
  raids: {
    list() { return http('GET','/api/raids') },
    get(id){ return http('GET',`/api/raids/${id}`) },
    create(data){ return http('POST','/api/raids', data) },
    update(id, data){ return http('PUT', `/api/raids/${id}`, data) },
    delete(id){ return http('DELETE', `/api/raids/${id}`) },
    signups(id){ return http('GET', `/api/raids/${id}/signups`) }
  }
}
