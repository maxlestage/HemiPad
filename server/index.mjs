// Serveur du site vitrine HemiPad.
//
// Heroku fournit le port par la variable d'environnement PORT ; tout le reste
// est statique. Le serveur ne fait donc que trois choses : compresser, servir
// les fichiers construits par Vite avec un cache correct, et répondre sur une
// route de santé pour que la plateforme sache que l'application tourne.

import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import compression from 'compression'
import express from 'express'

const directory = path.dirname(fileURLToPath(import.meta.url))
const distribution = path.resolve(directory, '..', 'web', 'dist')
const port = process.env.PORT || 3000

const app = express()

app.disable('x-powered-by')
// Heroku termine le TLS devant l'application et transmet le protocole
// d'origine dans X-Forwarded-Proto : on fait confiance à ce seul intermédiaire.
app.set('trust proxy', 1)

// Politique de sécurité du contenu. Le site ne charge rien d'ailleurs : ni
// police, ni script, ni image d'un tiers. Tout ce qui ne vient pas du site
// lui-même est donc refusé, les scripts en ligne compris.
const politique = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'"
]

app.use((request, response, next) => {
  // HTTPS obligatoire : une visite en clair est renvoyée vers la même adresse
  // chiffrée. En local (pas d'en-tête du routeur), rien ne change.
  if (request.get('x-forwarded-proto') === 'http') {
    // L'adresse de destination vient de l'en-tête Host, celui sur lequel le
    // routeur de Heroku aiguille (il ne mène donc qu'à nos propres domaines),
    // et non de X-Forwarded-Host, que n'importe quel client peut écrire :
    // sinon une redirection vers un autre site pourrait se glisser dans un
    // cache placé devant le site.
    const hote = request.get('host') ?? ''
    if (!/^[a-z0-9.-]+(:\d+)?$/i.test(hote)) {
      response.status(400).type('text/plain').send('Requête refusée')
      return
    }
    response.redirect(301, `https://${hote}${request.originalUrl}`)
    return
  }
  const chiffre = request.secure
  const directives = politique
  response.set({
    'Content-Security-Policy': (chiffre ? [...directives, 'upgrade-insecure-requests'] : directives).join('; '),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    // L'inclinaison de la démonstration lit l'accéléromètre et le gyroscope ;
    // tout le reste est coupé.
    'Permissions-Policy':
      'accelerometer=(self), gyroscope=(self), web-share=(self), clipboard-write=(self), ' +
      'camera=(), microphone=(), geolocation=(), payment=(), usb=(), bluetooth=(), serial=(), hid=(), midi=(), magnetometer=()'
  })
  if (chiffre) {
    response.set('Strict-Transport-Security', 'max-age=63072000; includeSubDomains')
  }
  next()
})

app.use(compression())

// Le service worker et le manifeste ne doivent jamais être servis depuis un
// cache périmé : c'est par eux que passe toute mise à jour de l'application
// installée. Un service worker figé garderait une version obsolète pour
// toujours.
app.get('/sw.js', (_request, response) => {
  response.set('Cache-Control', 'no-cache, no-store, must-revalidate')
  response.type('application/javascript')
  response.sendFile(path.join(distribution, 'sw.js'))
})

app.get('/manifest.webmanifest', (_request, response) => {
  response.set('Cache-Control', 'no-cache')
  response.type('application/manifest+json')
  response.sendFile(path.join(distribution, 'manifest.webmanifest'))
})

// Les fichiers versionnés par Vite (assets/nom.hash.js) ne changent jamais :
// cache long. L'index, lui, doit être revalidé à chaque visite, sinon une mise
// en ligne reste invisible pendant des heures.
app.use(
  '/assets',
  express.static(path.join(distribution, 'assets'), {
    immutable: true,
    maxAge: '1y',
    // Un fichier versionné absent est une vraie 404 : renvoyer l'index à sa
    // place ferait exécuter du HTML comme un script.
    fallthrough: false
  })
)
app.use(
  express.static(distribution, {
    maxAge: '1h',
    setHeaders(response, filePath) {
      if (filePath.endsWith('index.html')) {
        response.setHeader('Cache-Control', 'no-cache')
      }
    }
  })
)

app.get('/healthz', (_request, response) => {
  response.json({ status: 'ok', build: existsSync(distribution) })
})

// Site à page unique : toute autre route renvoie l'index.
app.get('*', (_request, response, next) => {
  const index = path.join(distribution, 'index.html')
  if (!existsSync(index)) {
    next(new Error("le site n'a pas été construit : lancez npm run build"))
    return
  }
  response.sendFile(index)
})

app.use((error, _request, response, _next) => {
  // Les détails restent dans le journal du serveur : le visiteur n'en voit
  // aucun.
  const statut = Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500
  if (statut >= 500) console.error(error)
  const message = statut === 404 ? 'Introuvable' : statut < 500 ? 'Requête refusée' : 'Erreur interne'
  response.status(statut).type('text/plain').send(message)
})

app.listen(port, () => {
  console.log(`HemiPad écoute sur le port ${port}`)
})
