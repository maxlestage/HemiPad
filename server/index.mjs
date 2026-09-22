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
app.use(compression())

// Les fichiers versionnés par Vite (assets/nom.hash.js) ne changent jamais :
// cache long. L'index, lui, doit être revalidé à chaque visite, sinon une mise
// en ligne reste invisible pendant des heures.
app.use(
  '/assets',
  express.static(path.join(distribution, 'assets'), {
    immutable: true,
    maxAge: '1y'
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
  console.error(error)
  response.status(500).type('text/plain').send(error.message)
})

app.listen(port, () => {
  console.log(`HemiPad écoute sur le port ${port}`)
})
