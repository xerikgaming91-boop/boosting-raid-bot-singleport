// frontend/admin/vite.config.js
import { defineConfig } from 'vite'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  // WICHTIG: Root explizit auf den Admin-Ordner setzen
  root: __dirname,

  // Passe das bei Bedarf an deinen Output-Pfad an
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },

  // Optional: Ports für dev/preview
  server: { port: 5173 },
  preview: { port: 4173 },
})
