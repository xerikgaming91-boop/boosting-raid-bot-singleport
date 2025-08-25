# Boosting Raid Bot — Single Port (3000), Discord OAuth, React (JS)

Ein Port (3000) für UI + API + OAuth.
- Dev: Vite als Middleware in Express
- Prod: React-Build aus `dist/`

## Voraussetzungen
- Node **20 LTS** (unter Windows Node 22 vermeiden wegen `better-sqlite3` Builds)
- Bot auf dem Ziel-Guild mit Rechten: Manage Channels, View Channel, Send Messages

## Dev
```bash
npm install
npm run install:ui
# .env füllen
cp .env.example .env
npm run dev            # http://localhost:3000
```

## Prod
```bash
npm run build:ui
npm run start
```

### OAuth
Im Discord Developer Portal Redirect-URI **exakt**
`http://localhost:3000/auth/discord/callback`
hinterlegen und dieselbe in `.env` eintragen.
