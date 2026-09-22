/*
 * Vérification du site dans un vrai navigateur.
 *
 * Ce que les tests unitaires ne peuvent pas dire : est-ce que la page tient
 * dans un écran de 320 px, est-ce que le thème clair s'applique vraiment,
 * est-ce que l'application installable s'installe et fonctionne hors
 * connexion. Le script sort en erreur au premier manquement.
 *
 *     node web/tools/verify-site.mjs [http://localhost:4173]
 *
 * Nécessite playwright-core et un Chromium (PLAYWRIGHT_EXECUTABLE pour en
 * désigner un déjà installé).
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

const base = process.argv[2] || 'http://localhost:4173'
const here = path.dirname(fileURLToPath(import.meta.url))
const shots = path.resolve(here, '..', 'public', 'screenshots')

const failures = []
const notes = []

function check(condition, label, detail = '') {
  if (condition) {
    notes.push(`  ✓ ${label}`)
  } else {
    failures.push(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`)
  }
}

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/opt/pw-browsers/chromium'
})

// --- Langues ---------------------------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'networkidle' })

  check(errors.length === 0, 'aucune erreur JavaScript au chargement', errors.join(' | '))

  const titles = {}
  for (const [name, expected] of [
    ['Français', 'fr'],
    ['English', 'en'],
    ['Español', 'es']
  ]) {
    await page.getByRole('button', { name: new RegExp(`: ${name}$`) }).click()
    await page.waitForTimeout(150)
    const lang = await page.evaluate(() => document.documentElement.lang)
    const heading = (await page.locator('h1').first().innerText()).replace(/\s+/g, ' ')
    titles[expected] = heading
    check(lang === expected, `langue ${name} : attribut lang="${expected}"`, `obtenu "${lang}"`)
  }
  const distinct = new Set(Object.values(titles))
  check(distinct.size === 3, 'les trois langues affichent trois titres différents', [...distinct].join(' / '))
  await context.close()
}

// --- Thèmes ----------------------------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const readTheme = () =>
    page.evaluate(() => ({
      attribute: document.documentElement.dataset.theme,
      background: getComputedStyle(document.body).backgroundColor,
      meta: document.querySelector('meta[name="theme-color"]')?.getAttribute('content')
    }))

  // Les sélecteurs de thème vivent dans le pied de page : la démo a elle
  // aussi un bouton « Automatique », pour la disposition.
  const preferences = page.locator('.footer-preferences')
  await preferences.getByRole('button', { name: /^(Clair|Light|Claro)$/ }).click()
  await page.waitForTimeout(120)
  const light = await readTheme()
  check(light.attribute === 'light', 'thème clair appliqué', JSON.stringify(light))
  check(light.background === 'rgb(244, 246, 252)', 'fond clair réellement rendu', light.background)
  check(light.meta === '#f4f6fc', 'couleur de barre système mise à jour', String(light.meta))

  await preferences.getByRole('button', { name: /^(Sombre|Dark|Oscuro)$/ }).click()
  await page.waitForTimeout(120)
  const dark = await readTheme()
  check(dark.background === 'rgb(5, 6, 13)', 'fond sombre réellement rendu', dark.background)

  await preferences.getByRole('button', { name: /^(Automatique|Automatic|Automático)$/ }).click()
  await page.waitForTimeout(120)
  const auto = await readTheme()
  check(auto.attribute === 'auto', 'thème automatique sélectionné', String(auto.attribute))
  await context.close()
}

// Le mode automatique doit suivre le système, dans les deux sens.
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  const expected = scheme === 'light' ? 'rgb(244, 246, 252)' : 'rgb(5, 6, 13)'
  check(background === expected, `mode automatique suit un système en ${scheme}`, background)
  await context.close()
}

// --- Débordement horizontal ------------------------------------------------

for (const scheme of ['dark', 'light']) {
  for (const width of [320, 360, 390, 430, 768, 1280]) {
    const context = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 900 } })
    const page = await context.newPage()
    await page.goto(base, { waitUntil: 'networkidle' })
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    check(!overflow, `pas de défilement horizontal à ${width} px (${scheme})`)
    await context.close()
  }
}

// --- Espacement des boutons ------------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  const gaps = await page.evaluate(() => {
    const measure = (selector) => {
      const items = [...document.querySelectorAll(selector)].map((el) => el.getBoundingClientRect())
      let smallest = Infinity
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i]
          const b = items[j]
          const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))
          const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
          if (dx === 0 && dy === 0) continue
          smallest = Math.min(smallest, Math.max(dx, dy))
        }
      }
      return Number.isFinite(smallest) ? smallest : null
    }
    return {
      hero: measure('.hero-actions .button'),
      keys: measure('.key-grid .key'),
      chips: measure('.chip-row .chip'),
      modifiers: measure('.modifier-row .modifier')
    }
  })
  for (const [name, value] of Object.entries(gaps)) {
    check(value === null || value >= 10, `boutons « ${name} » espacés d'au moins 10 px`, `${value} px`)
  }

  // Taille des cibles : jamais sous 44 px, la règle que le projet applique
  // partout ailleurs.
  const tooSmall = await page.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('button, .button, a.button')) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0) continue
      if (rect.height < 44) bad.push(`${el.className || el.tagName} ${Math.round(rect.height)}px`)
    }
    return bad
  })
  check(tooSmall.length === 0, 'toutes les cibles font au moins 44 px de haut', tooSmall.join(', '))

  // Un libellé qui déborde de son bouton est illisible sur un petit écran :
  // on le détecte plutôt que de l'espérer.
  const clipped = await page.evaluate(() => {
    const bad = []
    for (const el of document.querySelectorAll('.segmented button, .chip, .key')) {
      if (el.scrollWidth > el.clientWidth + 1) bad.push(`${el.textContent?.trim()} (${el.scrollWidth}>${el.clientWidth})`)
    }
    return bad
  })
  check(clipped.length === 0, 'aucun libellé de bouton tronqué', clipped.join(', '))
  await context.close()
}

// --- Contraste du texte ----------------------------------------------------

for (const scheme of ['dark', 'light']) {
  const context = await browser.newContext({ colorScheme: scheme, viewport: { width: 390, height: 900 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const results = await page.evaluate(() => {
    const parse = (value) => {
      const parts = value.match(/[\d.]+/g)?.map(Number) ?? []
      return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 }
    }
    const over = (front, back) => ({
      r: front.r * front.a + back.r * (1 - front.a),
      g: front.g * front.a + back.g * (1 - front.a),
      b: front.b * front.a + back.b * (1 - front.a),
      a: 1
    })
    // Le fond réel d'un texte est l'empilement de tous les fonds semi-opaques
    // au-dessus du fond de page : le composer est la seule façon d'obtenir le
    // contraste que l'œil perçoit vraiment.
    const effectiveBackground = (element) => {
      const stack = []
      let node = element
      while (node) {
        const background = parse(getComputedStyle(node).backgroundColor)
        if (background.a > 0) stack.push(background)
        node = node.parentElement
      }
      let result = { r: 255, g: 255, b: 255, a: 1 }
      for (const layer of stack.reverse()) result = over(layer, result)
      return result
    }
    const luminance = ({ r, g, b }) => {
      const channel = (value) => {
        const v = value / 255
        return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    }
    const ratio = (a, b) => {
      const la = luminance(a)
      const lb = luminance(b)
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
    }

    const selectors = [
      '.lede',
      '.hint',
      '.eyebrow',
      '.feature-problem',
      '.macro-detail',
      '.spec-list dd',
      '.footer-body',
      '.footer-legal p',
      '.footer-links a'
    ]
    return selectors.map((selector) => {
      const element = document.querySelector(selector)
      if (!element) return { selector, missing: true }
      const style = getComputedStyle(element)
      const colour = parse(style.color)
      const background = effectiveBackground(element)
      const size = parseFloat(style.fontSize)
      const bold = Number(style.fontWeight) >= 700
      const large = size >= 24 || (size >= 18.66 && bold)
      return {
        selector,
        ratio: Math.round(ratio(over(colour, background), background) * 100) / 100,
        required: large ? 3 : 4.5
      }
    })
  })

  for (const result of results) {
    if (result.missing) continue
    check(
      result.ratio >= result.required,
      `contraste ${scheme} ${result.selector} ≥ ${result.required}`,
      `${result.ratio}`
    )
  }
  await context.close()
}

// --- Disposition libre et réglages par commande ----------------------------

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('#demo').scrollIntoViewIfNeeded()

  const bouton = (nom) => page.locator('.demo-controls').getByRole('button', { name: nom, exact: true })

  // Passer en disposition libre doit ouvrir l'édition : sans elle, rien
  // n'est déplaçable et le mode n'aurait aucun effet visible.
  await bouton(/^(Libre|Free)$/).first().click()
  await page.waitForTimeout(200)
  const editionOuverte = await page.locator('.control.is-editing').count()
  check(editionOuverte > 0, 'la disposition libre ouvre le mode édition', String(editionOuverte))

  // Glisser une commande la déplace réellement.
  const cible = page.locator('[data-control="faceS"]')
  const avant = await cible.boundingBox()
  await page.mouse.move(avant.x + avant.width / 2, avant.y + avant.height / 2)
  await page.mouse.down()
  await page.mouse.move(avant.x + avant.width / 2 - 120, avant.y + avant.height / 2 - 60, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const apres = await cible.boundingBox()
  const deplacement = Math.hypot(apres.x - avant.x, apres.y - avant.y)
  check(deplacement > 40, 'une commande se déplace au glisser', `${Math.round(deplacement)} px`)

  // Le glissement ne sort jamais la commande du cadre.
  const cadre = await page.locator('.phone-screen').boundingBox()
  check(
    apres.x >= cadre.x - 1 && apres.x + apres.width <= cadre.x + cadre.width + 1,
    'la commande déplacée reste dans le cadre'
  )

  // Masquer une commande la retire et la range parmi les masquées.
  await cible.click()
  await page.waitForTimeout(150)
  await page.locator('.control-panel').getByRole('button', { name: /^(Masquer|Hide|Ocultar)$/ }).click()
  await page.waitForTimeout(200)
  check(
    (await page.locator('[data-control="faceS"]').count()) === 0,
    'une commande masquée disparaît de la manette'
  )
  check(
    (await page.locator('[data-hidden-control="faceS"]').count()) === 1,
    'une commande masquée reste récupérable en bas de l’écran'
  )

  // La commande reste sélectionnée après avoir été masquée : le panneau est
  // toujours ouvert, et le même bouton la réaffiche.
  await page.locator('.control-panel').getByRole('button', { name: /^(Afficher|Show|Mostrar)$/ }).click()
  await page.waitForTimeout(200)
  check(
    (await page.locator('[data-control="faceS"]').count()) === 1,
    'une commande masquée se réaffiche'
  )

  // Sélection multiple : verrouiller deux commandes d'un geste.
  await page.locator('.control-panel').getByRole('button', { name: /^(Désélectionner|Deselect|Deseleccionar)$/ }).click()
  await page.waitForTimeout(150)
  await page.locator('[data-control="L2"]').click()
  await page.locator('[data-control="R2"]').click()
  await page.waitForTimeout(150)
  check(
    /2/.test(await page.locator('.control-panel .panel-badge').first().innerText()),
    'deux commandes se règlent ensemble'
  )
  await page.locator('.control-panel').getByRole('button', { name: /^(Verrouiller|Lock|Bloquear)$/ }).click()
  await page.waitForTimeout(200)
  check(
    (await page.locator('[data-control="L2"].is-locked').count()) === 1 &&
      (await page.locator('[data-control="R2"].is-locked').count()) === 1,
    'les deux commandes sont verrouillées d’un seul geste'
  )

  // Une commande verrouillée ne se déplace plus.
  const verrouillee = page.locator('[data-control="L2"]')
  const avantVerrou = await verrouillee.boundingBox()
  await page.mouse.move(avantVerrou.x + avantVerrou.width / 2, avantVerrou.y + avantVerrou.height / 2)
  await page.mouse.down()
  await page.mouse.move(avantVerrou.x + avantVerrou.width / 2 - 100, avantVerrou.y + avantVerrou.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const apresVerrou = await verrouillee.boundingBox()
  check(
    Math.hypot(apresVerrou.x - avantVerrou.x, apresVerrou.y - avantVerrou.y) < 2,
    'une commande verrouillée refuse de bouger'
  )

  // Mode d'appui propre à une commande : verrouillant alors que le réglage
  // général est en appui direct.
  await page.locator('.control-panel').getByRole('button', { name: /^(Désélectionner|Deselect|Deseleccionar)$/ }).click()
  await page.waitForTimeout(150)
  await bouton(/^(Appui direct|Direct press|Pulsación directa)$/).first().click()
  await page.locator('[data-control="faceE"]').click()
  await page.waitForTimeout(150)
  await page
    .locator('.control-panel')
    .getByRole('button', { name: /^(Verrouillant|Latching|Con bloqueo)$/ })
    .click()
  await page.waitForTimeout(150)
  await bouton(/^(Terminé|Done|Hecho)$/).first().click()
  await page.waitForTimeout(150)

  await page.locator('[data-control="faceE"]').click()
  await page.waitForTimeout(600)
  check(
    (await page.locator('[data-control="faceE"].is-active').count()) === 1,
    'une commande réglée en verrouillant reste enfoncée'
  )
  await page.locator('[data-control="faceS"]').click()
  await page.waitForTimeout(600)
  check(
    (await page.locator('[data-control="faceS"].is-active').count()) === 0,
    'ses voisines restent en appui direct'
  )

  check(errors.length === 0, 'aucune erreur JavaScript pendant l’édition', errors.join(' | '))
  await context.close()
}

// --- Espacement réglable ---------------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const ecartMinimal = async () =>
    page.evaluate(() => {
      const items = [...document.querySelectorAll('.control:not(.is-hidden-control)')].map((el) =>
        el.getBoundingClientRect()
      )
      let plusPetit = Infinity
      for (let i = 0; i < items.length; i += 1) {
        for (let j = i + 1; j < items.length; j += 1) {
          const a = items[i]
          const b = items[j]
          const dx = Math.max(0, Math.max(a.left, b.left) - Math.min(a.right, b.right))
          const dy = Math.max(0, Math.max(a.top, b.top) - Math.min(a.bottom, b.bottom))
          plusPetit = Math.min(plusPetit, Math.hypot(dx, dy))
        }
      }
      return plusPetit
    })

  const curseur = page
    .locator('.demo-controls')
    .getByLabel(/^(Espacement|Spacing|Separación)$/)
  await curseur.fill('1.05')
  await page.waitForTimeout(250)
  const serre = await ecartMinimal()
  await curseur.fill('1.6')
  await page.waitForTimeout(250)
  const large = await ecartMinimal()

  check(large > serre, "le curseur d'espacement écarte réellement les commandes", `${serre.toFixed(1)} px → ${large.toFixed(1)} px`)
  await context.close()
}

// --- Application installable ----------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const manifestResponse = await page.request.get(`${base}/manifest.webmanifest`)
  check(manifestResponse.ok(), 'manifeste servi', String(manifestResponse.status()))
  const manifest = await manifestResponse.json()
  check(manifest.display === 'standalone', 'manifeste : affichage autonome')
  check(manifest.start_url?.length > 0, 'manifeste : URL de démarrage')
  check(
    manifest.icons?.some((icon) => icon.purpose === 'maskable'),
    'manifeste : icône adaptative (maskable)'
  )
  for (const icon of manifest.icons ?? []) {
    const response = await page.request.get(`${base}${icon.src}`)
    check(response.ok(), `icône disponible : ${icon.src}`, String(response.status()))
  }

  // Les icônes déclarées dans la page, elles, ne passent par aucun manifeste :
  // un lien mort n'y laisse qu'un carré vide dans l'onglet, sans erreur.
  const déclarées = await page.$$eval(
    'link[rel~="icon"], link[rel="apple-touch-icon"]',
    (liens) => liens.map((lien) => lien.getAttribute('href'))
  )
  check(déclarées.length >= 4, 'icônes déclarées dans la page', String(déclarées.length))
  for (const href of déclarées) {
    const response = await page.request.get(`${base}${href}`)
    check(response.ok(), `icône déclarée servie : ${href}`, String(response.status()))
  }

  const sw = await page.request.get(`${base}/sw.js`)
  check(sw.ok(), 'service worker servi', String(sw.status()))
  check(
    (sw.headers()['cache-control'] || '').includes('no-cache'),
    'service worker jamais mis en cache',
    sw.headers()['cache-control']
  )

  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready
    return Boolean(registration.active)
  })
  check(registered, 'service worker actif')

  // Hors connexion : la page doit rester consultable.
  await context.setOffline(true)
  await page.reload({ waitUntil: 'domcontentloaded' })
  const offlineHeading = await page
    .locator('h1')
    .first()
    .innerText()
    .catch(() => '')
  check(offlineHeading.length > 0, 'site consultable hors connexion', offlineHeading)
  await context.setOffline(false)
  await context.close()
}

// --- Fiche de partage ------------------------------------------------------

{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write']
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const ogImage = await page.getAttribute('meta[property="og:image"]', 'content')
  check(ogImage === '/partage.png', 'balise og:image renseignée', String(ogImage))
  const image = await page.request.get(`${base}${ogImage}`)
  check(image.ok(), 'image de partage disponible', String(image.status()))

  const shareButton = page.locator('.share-actions .button.primary')
  await shareButton.click()
  await page.waitForTimeout(200)
  const label = await shareButton.innerText()
  check(/copié|copied|copiado/i.test(label), 'le bouton confirme la copie du lien', label)
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  check(clipboard.startsWith('http'), 'lien réellement copié', clipboard)
  await context.close()
}

// --- Captures pour le manifeste -------------------------------------------

await mkdir(shots, { recursive: true })
for (const [name, viewport] of [
  ['mobile', { width: 390, height: 844 }],
  ['desktop', { width: 1280, height: 800 }]
]) {
  const context = await browser.newContext({ viewport, colorScheme: 'dark' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('#demo').scrollIntoViewIfNeeded()
  await page.waitForTimeout(400)
  await writeFile(path.join(shots, `${name}.png`), await page.screenshot())
  await context.close()
  notes.push(`  ✓ capture ${name}.png (${viewport.width}×${viewport.height})`)
}

await browser.close()

console.log(notes.join('\n'))
if (failures.length > 0) {
  console.error(`\n${failures.length} vérification(s) en échec :`)
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`\n${notes.length} vérifications passées.`)
