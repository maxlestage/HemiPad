import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    // Le site lui-même tient en quelques dizaines de kilo-octets : un seul
    // morceau évite une cascade de requêtes sur une connexion mobile.
    //
    // La seule exception est la scène 3D du hero (three.js et son rendu, près
    // d'un mégaoctet). Elle vit dans son propre morceau, chargé à la demande
    // et jamais téléchargé quand la personne a demandé le calme : la limite
    // est relevée pour elle, pas pour laisser grossir le reste.
    chunkSizeWarningLimit: 900,
    target: 'es2020'
  },
  server: {
    port: 5173,
    // Serveur de développement sur cette machine seulement : l'exposer au
    // réseau local donnerait accès aux sources à tout voisin de Wi-Fi.
    host: 'localhost'
  }
})
