import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Le site tient en quelques dizaines de kilo-octets : un seul morceau
    // évite une cascade de requêtes sur une connexion mobile.
    chunkSizeWarningLimit: 700,
    target: 'es2020'
  },
  server: {
    port: 5173,
    host: true
  }
})
