/*
 * Construit le site : Rust → WebAssembly → web/dist.
 *
 *     node web/tools/construire.mjs          # version de production
 *     node web/tools/construire.mjs --dev    # sans optimisation, plus rapide
 *
 * Étapes :
 *   1. compiler la crate Yew pour wasm32-unknown-unknown ;
 *   2. générer les liaisons JavaScript avec wasm-bindgen — la version exacte
 *      de la crate, téléchargée et vérifiée par son empreinte si elle manque ;
 *   3. assembler la feuille de style et les polices servies par le site ;
 *   4. écrire index.html, avec des noms de fichiers qui changent à chaque
 *      version (cache d'un an possible) et aucun script en ligne : la
 *      politique de sécurité (CSP) n'autorise que les fichiers du site.
 *
 * Pas de Trunk : son chargeur est un script en ligne, que la CSP refuse.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { chmod, copyFile, cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ici = path.dirname(fileURLToPath(import.meta.url))
const web = path.resolve(ici, '..')
const dist = path.join(web, 'dist')
const assets = path.join(dist, 'assets')
const dev = process.argv.includes('--dev')
/** Le dossier de compilation de Cargo, déplaçable (Heroku le met hors du slug). */
const cible = process.env.CARGO_TARGET_DIR ? path.resolve(process.env.CARGO_TARGET_DIR) : path.join(web, 'target')

/** La version de wasm-bindgen doit être celle de Cargo.toml, au correctif près. */
const WASM_BINDGEN = '0.2.129'
/** Empreinte de l'archive officielle pour Linux x86_64 (musl, sans dépendance). */
const WASM_BINDGEN_SHA256 = '82d12bb940e2d4e72e0d5605387fc1b8ca179044e012b620f0ce4e7440e8320e'

function lancer(commande, args, options = {}) {
  execFileSync(commande, args, { stdio: 'inherit', cwd: web, ...options })
}

function empreinte(contenu) {
  return createHash('sha256').update(contenu).digest('hex').slice(0, 10)
}

function version(commande) {
  try {
    return execFileSync(commande, ['--version'], { encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

/** Le chemin d'un wasm-bindgen de la bonne version, téléchargé au besoin. */
async function wasmBindgen() {
  if (version('wasm-bindgen') === `wasm-bindgen ${WASM_BINDGEN}`) return 'wasm-bindgen'

  const outils = process.env.HEMIPAD_OUTILS ? path.resolve(process.env.HEMIPAD_OUTILS) : path.join(web, '.outils')
  const nom = `wasm-bindgen-${WASM_BINDGEN}-x86_64-unknown-linux-musl`
  const binaire = path.join(outils, nom, 'wasm-bindgen')
  if (existsSync(binaire)) return binaire

  if (os.platform() !== 'linux' || os.arch() !== 'x64') {
    throw new Error(
      `wasm-bindgen ${WASM_BINDGEN} introuvable : installez-le avec « cargo install wasm-bindgen-cli --version ${WASM_BINDGEN} --locked »`
    )
  }

  console.log(`• téléchargement de wasm-bindgen ${WASM_BINDGEN}`)
  const adresse = `https://github.com/wasm-bindgen/wasm-bindgen/releases/download/${WASM_BINDGEN}/${nom}.tar.gz`
  const reponse = await fetch(adresse)
  if (!reponse.ok) throw new Error(`téléchargement refusé (${reponse.status}) : ${adresse}`)
  const archive = Buffer.from(await reponse.arrayBuffer())
  const obtenue = createHash('sha256').update(archive).digest('hex')
  // Un outil qui écrit le code servi aux visiteurs : une archive qui n'est
  // pas exactement celle attendue est refusée.
  if (obtenue !== WASM_BINDGEN_SHA256) {
    throw new Error(`empreinte inattendue pour wasm-bindgen : ${obtenue}`)
  }
  await mkdir(outils, { recursive: true })
  const fichier = path.join(outils, `${nom}.tar.gz`)
  await writeFile(fichier, archive)
  lancer('tar', ['-xzf', fichier, '-C', outils])
  await chmod(binaire, 0o755)
  return binaire
}

/** Copie un fichier dans assets/ sous un nom qui porte son empreinte. */
async function versionner(source, nom) {
  const contenu = await readFile(source)
  const extension = path.extname(nom)
  const base = path.basename(nom, extension)
  const cible = `${base}-${empreinte(contenu)}${extension}`
  await writeFile(path.join(assets, cible), contenu)
  return `/assets/${cible}`
}

/** Les polices, servies par le site lui-même : aucune requête vers un tiers. */
async function polices() {
  const require = createRequire(path.join(web, 'package.json'))
  const feuilles = [
    '@fontsource/space-grotesk/latin-400.css',
    '@fontsource/space-grotesk/latin-500.css',
    '@fontsource/space-grotesk/latin-700.css',
    '@fontsource/jetbrains-mono/latin-400.css',
    '@fontsource/jetbrains-mono/latin-600.css'
  ]
  let css = ''
  for (const feuille of feuilles) {
    const chemin = require.resolve(feuille)
    let texte = await readFile(chemin, 'utf8')
    const remplacements = []
    for (const [, relatif] of texte.matchAll(/url\(\.\/([^)]+)\)/g)) {
      const url = await versionner(path.join(path.dirname(chemin), relatif), path.basename(relatif))
      remplacements.push([`./${relatif}`, url])
    }
    for (const [avant, apres] of remplacements) texte = texte.replaceAll(avant, apres)
    css += texte + '\n'
  }
  return css
}

async function principal() {
  const debut = Date.now()
  await rm(dist, { recursive: true, force: true })
  await mkdir(assets, { recursive: true })

  // 1. Compilation.
  const profil = dev ? 'debug' : 'release'
  lancer('cargo', ['build', '--locked', '--target', 'wasm32-unknown-unknown', ...(dev ? [] : ['--release'])])
  const wasm = path.join(cible, 'wasm32-unknown-unknown', profil, 'hemipad-site.wasm')

  // 2. Liaisons JavaScript.
  const sortie = path.join(cible, 'liaisons')
  await rm(sortie, { recursive: true, force: true })
  lancer(await wasmBindgen(), ['--target', 'web', '--no-typescript', '--out-dir', sortie, '--out-name', 'hemipad', wasm])
  const urlWasm = await versionner(path.join(sortie, 'hemipad_bg.wasm'), 'hemipad.wasm')
  const urlLiaisons = await versionner(path.join(sortie, 'hemipad.js'), 'hemipad.js')

  // Le chargeur : un fichier du site, pas un script en ligne.
  const chargeur = `import init from '${urlLiaisons}'\ninit({ module_or_path: '${urlWasm}' }).catch((erreur) => {\n  document.documentElement.classList.add('sans-programme')\n  console.error('HemiPad : le programme WebAssembly ne s\\'est pas chargé', erreur)\n})\n`
  const urlChargeur = `/assets/demarrage-${empreinte(chargeur)}.js`
  await writeFile(path.join(dist, urlChargeur), chargeur)

  // 3. Styles et polices.
  const dossierStyles = path.join(web, 'styles')
  const fichiers = (await readdir(dossierStyles)).filter((f) => f.endsWith('.css')).sort()
  let css = await polices()
  for (const fichier of fichiers) css += `\n/* ${fichier} */\n` + (await readFile(path.join(dossierStyles, fichier), 'utf8'))
  const urlStyle = `/assets/site-${empreinte(css)}.css`
  await writeFile(path.join(dist, urlStyle), css)

  // 4. Fichiers publics et page.
  await cp(path.join(web, 'public'), dist, { recursive: true })
  const precharges = [
    `<link rel="modulepreload" href="${urlLiaisons}" />`,
    `<link rel="preload" href="${urlWasm}" as="fetch" type="application/wasm" crossorigin />`
  ].join('\n    ')
  const modele = await readFile(path.join(web, 'index.html'), 'utf8')
  const page = modele
    .replace('{{PRECHARGES}}', precharges)
    .replace('{{STYLE}}', urlStyle)
    .replace('{{DEMARRAGE}}', urlChargeur)
  if (page.includes('{{')) throw new Error('un emplacement de index.html est resté vide')
  await writeFile(path.join(dist, 'index.html'), page)

  const taille = (await stat(path.join(dist, urlWasm))).size
  console.log(
    `✓ site construit en ${((Date.now() - debut) / 1000).toFixed(1)} s — programme ${(taille / 1024).toFixed(0)} Kio (${profil})`
  )
}

principal().catch((erreur) => {
  console.error(erreur.message ?? erreur)
  process.exit(1)
})
