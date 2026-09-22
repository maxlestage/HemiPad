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
 * Nécessite playwright-core et un Chromium. Le navigateur est cherché dans
 * l'ordre décrit par `chromium.mjs` ; en intégration continue, il est installé
 * par `playwright-core install chromium`.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

import { optionsDeLancement } from './chromium.mjs'

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

const browser = await chromium.launch(
  optionsDeLancement({
    // Sans carte graphique, Chromium refuse WebGL et la scène 3D basculerait
    // sur l'image fixe — la vérification passerait sans avoir rien vérifié. On
    // lui impose le rendu logiciel pour tester le vrai chemin.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  })
)

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

  // Les sélecteurs de thème vivent dans le pied de page, et « Automatique »
  // y apparaît deux fois : une fois pour le thème, une fois pour les
  // animations. On vise le groupe, jamais le seul libellé.
  const preferences = page.locator('.preference-theme')
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
  await page.waitForTimeout(700)
  const serre = await ecartMinimal()
  await curseur.fill('1.6')
  await page.waitForTimeout(700)
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

// --- La scène 3D du hero ---------------------------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'networkidle' })

  const zone = page.locator('.hero-scene')
  check(await zone.count() === 1, 'la zone de la marque existe dans le hero')

  // La réserve de hauteur est là avant l'arrivée du morceau 3D : sans elle,
  // le texte sauterait au moment où la scène se charge.
  const hauteur = await zone.evaluate((n) => Math.round(n.getBoundingClientRect().height))
  check(hauteur > 120, 'la zone réserve sa hauteur avant le chargement', `${hauteur}px`)

  await page.waitForFunction(() => Boolean(document.querySelector('.hero-scene canvas')), null, {
    timeout: 15000
  }).catch(() => undefined)

  const rendu = await page.evaluate(() => {
    const canevas = document.querySelector('.hero-scene canvas')
    return {
      mode: document.querySelector('.hero-scene')?.getAttribute('data-scene'),
      largeur: canevas?.width ?? 0,
      hauteur: canevas?.height ?? 0
    }
  })
  check(rendu.mode === 'relief', 'la marque est rendue en relief', String(rendu.mode))
  check(rendu.largeur > 0 && rendu.hauteur > 0, 'le canevas WebGL a une taille réelle', JSON.stringify(rendu))

  // Une scène immobile ne serait qu'une image : deux captures espacées
  // doivent différer.
  //
  // La comparaison passe par des captures d'écran, pas par `toDataURL` : sans
  // `preserveDrawingBuffer`, le tampon de dessin WebGL est vidé une fois
  // l'image composée, et `toDataURL` ne renvoie qu'un rectangle vide — deux
  // rectangles vides se ressemblent beaucoup, et la vérification passerait
  // sans rien avoir vérifié.
  const avant = await zone.screenshot()
  await page.waitForTimeout(900)
  const apres = await zone.screenshot()
  check(
    avant.length > 0 && !avant.equals(apres),
    'la scène bouge réellement entre deux captures',
    `${avant.length} / ${apres.length} octets`
  )

  check(errors.length === 0, 'aucune erreur JavaScript avec la scène 3D', errors.join(' | '))
  await context.close()
}

// Réglage système « Réduire les animations » : rien ne doit bouger, et le
// morceau 3D ne doit même pas être téléchargé.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  const telecharges = []
  page.on('request', (requete) => telecharges.push(requete.url()))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(600)

  const mode = await page.locator('.hero-scene').getAttribute('data-scene')
  check(mode === 'plate', 'animations réduites : la marque reste à plat', String(mode))
  check(
    (await page.locator('.hero-scene canvas').count()) === 0,
    'animations réduites : aucun canevas WebGL'
  )
  check(
    !telecharges.some((url) => /HeroCanvas|three/i.test(url)),
    'animations réduites : le morceau 3D n\'est pas téléchargé',
    telecharges.filter((url) => /HeroCanvas|three/i.test(url)).join(' ')
  )
  await context.close()
}

// Le réglage du pied de page doit pouvoir contredire le système, dans les
// deux sens : apaiser une machine qui ne demande rien, et animer une machine
// qui demande le calme.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const animations = page.locator('.preference-animation')
  check(await animations.count() === 1, 'le réglage des animations est dans le pied de page')

  await animations.getByRole('button', { name: /^(Apaisées|Calm|En calma)$/ }).click()
  await page.waitForTimeout(250)
  check(
    (await page.locator('.hero-scene').getAttribute('data-scene')) === 'plate',
    'le réglage « apaisées » arrête la scène'
  )
  check(
    (await page.evaluate(() => document.documentElement.dataset.motion)) === 'reduced',
    'le choix est exposé au CSS'
  )

  // Le choix doit survivre à un rechargement : un réglage d'accessibilité
  // qu'il faut reprendre à chaque visite n'en est pas un.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  check(
    (await page.locator('.hero-scene').getAttribute('data-scene')) === 'plate',
    'le réglage « apaisées » survit au rechargement'
  )

  await page.locator('.preference-animation').getByRole('button', { name: /^(Animées|Animated|Animadas)$/ }).click()
  await page.waitForFunction(() => Boolean(document.querySelector('.hero-scene canvas')), null, {
    timeout: 15000
  }).catch(() => undefined)
  check(
    (await page.locator('.hero-scene canvas').count()) === 1,
    'le réglage « animées » rallume la scène'
  )
  await context.close()
}

// --- Les commandes glissent, elles ne sautent pas -------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('#demo').scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)

  const position = () =>
    page.evaluate(() => {
      const commande = document.querySelector('[data-control="directional"]')
      if (!commande) return null
      // La translation appliquée à l'instant, transition comprise : c'est ce
      // que le navigateur dessine, pas ce que React a demandé.
      const matrice = new DOMMatrixReadOnly(getComputedStyle(commande).transform)
      return matrice.e
    })

  const départ = await position()
  // Basculer la main renvoie toutes les commandes de l'autre côté : c'est le
  // plus grand déplacement que la démonstration sache produire.
  await page.getByRole('button', { name: /^(Gauche|Left|Izquierda)$/ }).click()
  const aussitôt = await position()
  await page.waitForTimeout(700)
  const arrivée = await position()

  check(
    départ !== null && arrivée !== null && Math.abs(arrivée - départ) > 150,
    'changer de main renvoie la commande de l’autre côté',
    `${départ} → ${arrivée}`
  )
  // Si la commande était déjà arrivée à la première mesure, c'est qu'elle a
  // sauté : la transition ne s'applique pas.
  check(
    aussitôt !== null && arrivée !== null && Math.abs(aussitôt - arrivée) > 8,
    'la commande glisse au lieu de sauter',
    `mesure immédiate ${aussitôt}, arrivée ${arrivée}`
  )
  await context.close()
}

// --- Apparition des sections au défilement --------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })

  const opacité = (sélecteur) =>
    page.evaluate(
      (s) => Number(getComputedStyle(document.querySelector(s)).opacity),
      sélecteur
    )

  check(await opacité('#partage') < 1, 'une section hors écran attend son tour')
  await page.locator('#partage').scrollIntoViewIfNeeded()
  await page.waitForTimeout(900)
  check(await opacité('#partage') === 1, 'la section apparaît quand on arrive dessus')

  // Aucune section ne doit rester coincée une fois la page parcourue.
  for (const ancre of ['#demo', '#accessibilite', '#clavier', '#consoles', '#technique']) {
    await page.locator(ancre).scrollIntoViewIfNeeded()
    await page.waitForTimeout(250)
  }
  await page.waitForTimeout(700)
  const restées = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')]
      .filter((n) => Number(getComputedStyle(n).opacity) < 1)
      .map((n) => n.id || n.className)
  )
  check(restées.length === 0, 'aucune section ne reste cachée après le parcours', restées.join(' '))
  await context.close()
}

// Animations réduites : aucune section ne doit dépendre d'une apparition.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const opacités = await page.evaluate(() =>
    [...document.querySelectorAll('.reveal')].map((n) => Number(getComputedStyle(n).opacity))
  )
  check(
    opacités.length > 0 && opacités.every((valeur) => valeur === 1),
    'animations réduites : toutes les sections sont visibles d\'emblée',
    opacités.join(' ')
  )
  await context.close()
}

// --- Le bouton « Suivant » ---------------------------------------------------

// Sur plusieurs tailles, et surtout celles de l'iPad. Quand l'écran est assez
// haut pour que les dernières sections y tiennent ensemble, elles ne peuvent
// plus remonter jusqu'à leur marge : sans garde, le bouton restait bloqué sur
// « partage » ou « pied », en boucle, sans jamais proposer de remonter. Le
// défaut ne se voyait ni sur téléphone ni sur un écran d'ordinateur portable —
// seulement sur l'appareil que le projet met en avant.
for (const [largeur, hauteur, tactile] of [
  [390, 844, true],
  [1280, 800, false],
  [1024, 1366, true],
  [1366, 1024, true]
]) {
  const à = ` (${largeur}×${hauteur})`
  const context = await browser.newContext({
    viewport: { width: largeur, height: hauteur },
    isMobile: tactile,
    hasTouch: tactile
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)

  const pager = page.locator('.pager')
  check(await pager.count() === 1, 'le bouton « Suivant » existe' + à)
  // Posé sur les boutons du hero, il en cachait un : il attend qu'on les ait
  // dépassés.
  check(
    (await pager.getAttribute('aria-hidden')) === 'true',
    'en haut de page, « Suivant » laisse la place aux boutons du hero' + à
  )

  // Le saut est instantané : la page défile en douceur par défaut, et une
  // attente fixe se retrouvait parfois à mesurer un défilement encore en cours.
  await page.evaluate(() => {
    const actions = document.querySelector('.hero-actions')
    window.scrollTo({
      top: actions.getBoundingClientRect().bottom + window.scrollY + 20,
      behavior: 'instant'
    })
  })
  const apparu = await page
    .waitForFunction(
      () => document.querySelector('.pager')?.getAttribute('aria-hidden') === 'false',
      null,
      { timeout: 3000 }
    )
    .then(() => true)
    .catch(() => false)
  check(apparu, 'une fois le hero dépassé, « Suivant » apparaît' + à)

  // Le parcours complet : chaque appui mène à la section suivante, dont le
  // titre doit rester visible sous la barre collante.
  const finDuDéfilement = () =>
    page.evaluate(
      () =>
        new Promise((résoudre) => {
          let dernier = -1
          let stable = 0
          const regarder = () => {
            stable = window.scrollY === dernier ? stable + 1 : 0
            dernier = window.scrollY
            // Immobile pendant dix images d'affilée : le défilement est fini.
            if (stable >= 10) résoudre()
            else requestAnimationFrame(regarder)
          }
          requestAnimationFrame(regarder)
        })
    )

  const visitées = []
  const cachées = []
  const malPlacées = []
  let remonté = false
  for (let appui = 0; appui < 12; appui += 1) {
    const cible = await pager.getAttribute('data-pager-target')
    await (tactile ? pager.tap() : pager.click())
    await page.waitForTimeout(80)
    await finDuDéfilement()
    if (cible === 'haut') {
      remonté = true
      const y = await page.evaluate(() => window.scrollY)
      check(y === 0, 'au bout du parcours, le même bouton ramène en haut' + à, `scrollY = ${y}`)
      break
    }
    visitées.push(cible)
    const position = await page.evaluate((id) => {
      const élément = id === 'pied' ? document.querySelector('footer') : document.getElementById(id)
      return {
        haut: élément.getBoundingClientRect().top,
        attendu: parseFloat(getComputedStyle(élément).scrollMarginTop) || 0,
        // Au bout de la page, on ne peut plus descendre : la dernière étape
        // s'arrête où elle peut, plus bas que sa marge.
        auBout:
          Math.ceil(window.scrollY + window.innerHeight) >= document.documentElement.scrollHeight - 1,
        barre: document.querySelector('.nav').getBoundingClientRect().bottom
      }
    }, cible)
    // Deux exigences distinctes. Arriver *sur* la section, à sa marge près —
    // pas quelque part au-dessus ou en dessous. Et ne jamais finir sous la
    // barre, quand elle est à l'écran.
    const surPlace = position.auBout
      ? position.haut >= position.attendu - 2
      : Math.abs(position.haut - position.attendu) <= 2
    if (!surPlace) {
      malPlacées.push(`${cible} à ${Math.round(position.haut)} px au lieu de ${position.attendu}`)
    }
    if (position.haut < position.barre - 1) {
      cachées.push(`${cible} (${Math.round(position.haut)} < ${Math.round(position.barre)})`)
    }
  }
  // Sans cette exigence, une boucle qui n'atteint jamais « haut » finissait
  // simplement ses douze tours, et rien n'échouait.
  check(remonté, 'le parcours se termine bien par « Haut de page »' + à, visitées.join(' → '))
  check(visitées.length >= 6, '« Suivant » parcourt toutes les sections' + à, visitées.join(' → '))
  check(malPlacées.length === 0, '« Suivant » arrive exactement au début de chaque section' + à, malPlacées.join(', '))
  check(cachées.length === 0, 'aucun titre ne finit caché sous la barre de navigation' + à, cachées.join(', '))
  check(errors.length === 0, 'aucune erreur JavaScript pendant le parcours' + à, errors.join(' | '))
  await context.close()
}

// La barre colle en haut là où elle porte le menu, et défile sur téléphone,
// où elle ne montre que le logo.
for (const [largeur, collante] of [[1280, true], [390, false]]) {
  const context = await browser.newContext({ viewport: { width: largeur, height: 800 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.evaluate(() => window.scrollTo({ top: 1600, behavior: 'instant' }))
  await page.waitForTimeout(200)
  const haut = await page.evaluate(() => document.querySelector('.nav').getBoundingClientRect().top)
  check(
    collante ? Math.abs(haut) < 1 : haut < -40,
    collante
      ? `à ${largeur} px, la barre de navigation reste en haut`
      : `à ${largeur} px, la barre de navigation laisse l’écran au contenu`,
    `haut de la barre : ${Math.round(haut)} px`
  )
  await context.close()
}

// Les liens du menu profitent de la même marge : c'est la même ancre.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('.nav-links a[href="#clavier"]').click()
  await page.waitForTimeout(1100)
  const position = await page.evaluate(() => ({
    haut: document.getElementById('clavier').getBoundingClientRect().top,
    barre: document.querySelector('.nav').getBoundingClientRect().bottom
  }))
  check(
    position.haut >= position.barre - 1,
    'un lien du menu ne cache plus le titre sous la barre',
    `${Math.round(position.haut)} px sous une barre de ${Math.round(position.barre)} px`
  )
  await context.close()
}

// --- Suivre l'inclinaison du téléphone -------------------------------------

// Sur ordinateur : pas de bouton, mais la souris doit atteindre la scène.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForFunction(() => Boolean(document.querySelector('.hero-scene canvas')), null, {
    timeout: 15000
  }).catch(() => undefined)
  check(
    (await page.locator('.hero-tilt-button').count()) === 0,
    'sur ordinateur, pas de bouton d’inclinaison — la souris suffit'
  )
  await page.mouse.move(200, 300)
  await page.mouse.move(1000, 400, { steps: 5 })
  const source = await page.evaluate(() => document.documentElement.dataset.inclinaison)
  check(source === 'pointeur', 'la souris atteint bien la scène 3D', String(source))
  await context.close()
}

// Sur téléphone, avec un gyroscope qui répond.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'networkidle' })

  const bouton = page.locator('.hero-tilt-button')
  check(await bouton.count() === 1, 'sur téléphone, le bouton d’inclinaison est proposé')
  check((await bouton.getAttribute('aria-pressed')) === 'false', 'le suivi est éteint par défaut')

  await bouton.tap()
  // Un vrai capteur émet en continu, et le composant ne l'écoute qu'une fois
  // l'autorisation obtenue. Chrome 153 a adopté l'autorisation à la Safari :
  // trois mesures envoyées d'un coup, tout de suite après l'appui, arrivaient
  // pendant cette attente et se perdaient. On attend donc que le suivi soit
  // réellement allumé, puis on simule un capteur qui émet toutes les 50 ms.
  const allumé = await page
    .waitForFunction(
      () => document.querySelector('.hero-tilt-button')?.getAttribute('aria-pressed') === 'true',
      null,
      { timeout: 3000 }
    )
    .then(() => true)
    .catch(() => false)
  check(allumé, 'l’appui allume le suivi, autorisation comprise')
  await page.evaluate(() => {
    let pas = 0
    window.__capteur = window.setInterval(() => {
      pas += 1
      const beta = 50 + Math.sin(pas / 6) * 8
      const gamma = Math.cos(pas / 7) * 14
      window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { alpha: 0, beta, gamma }))
    }, 50)
  })
  // Au-delà du délai d'attente du capteur : il doit rester allumé.
  await page.waitForTimeout(2000)
  check((await bouton.getAttribute('aria-pressed')) === 'true', 'le suivi reste allumé quand le capteur répond')
  check(
    (await page.evaluate(() => document.documentElement.dataset.inclinaison)) === 'orientation',
    'le gyroscope atteint bien la scène 3D'
  )
  check(
    ((await page.locator('.hero-tilt-message').textContent()) ?? '').trim() === '',
    'aucun message d’erreur quand tout fonctionne'
  )

  await bouton.tap()
  await page.waitForTimeout(200)
  check((await bouton.getAttribute('aria-pressed')) === 'false', 'un second appui éteint le suivi')
  // Le capteur simulé continue d'émettre : éteint, le suivi doit l'ignorer.
  await page.waitForTimeout(300)
  check(
    (await page.evaluate(() => document.documentElement.dataset.inclinaison)) === 'aucune',
    'éteindre le suivi remet la scène droite'
  )
  await page.evaluate(() => window.clearInterval(window.__capteur))
  check(errors.length === 0, 'aucune erreur JavaScript avec le suivi', errors.join(' | '))
  await context.close()
}

// Sur un appareil tactile sans capteur : on le dit, on ne fait pas semblant.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('.hero-tilt-button').tap()
  await page.waitForTimeout(2000)
  check(
    (await page.locator('.hero-tilt-button').getAttribute('aria-pressed')) === 'false',
    'sans capteur, le suivi ne prétend pas être allumé'
  )
  check(
    ((await page.locator('.hero-tilt-message').textContent()) ?? '').trim().length > 0,
    'sans capteur, un message l’explique'
  )
  await context.close()
}

// Animations réduites : suivre l'inclinaison est un mouvement comme un autre.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  check(
    (await page.locator('.hero-tilt-button').count()) === 0,
    'animations réduites : pas de suivi d’inclinaison proposé'
  )
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
