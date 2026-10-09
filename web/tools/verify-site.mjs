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

// Les commandes glissent vers leur nouvelle place (420 ms). Mesurer au bout
// d'un délai fixe, c'était parfois mesurer en plein trajet, et le contrôle
// échouait de loin en loin, sur une machine chargée. On attend qu'elles soient
// réellement immobiles : dix images d'affilée sans que la moindre ne bouge.
function attendreImmobiles(page) {
  return page.evaluate(
    () =>
      new Promise((résoudre) => {
        const relevé = () =>
          [...document.querySelectorAll('.control:not(.is-hidden-control)')]
            .map((n) => getComputedStyle(n).transform)
            .join('|')
        let dernier = ''
        let stable = 0
        const regarder = () => {
          const actuel = relevé()
          stable = actuel === dernier ? stable + 1 : 0
          dernier = actuel
          if (stable >= 10) résoudre()
          else requestAnimationFrame(regarder)
        }
        requestAnimationFrame(regarder)
      })
  )
}

// Le téléphone de la démonstration apparaît en glissant quand il entre à
// l'écran. Viser une commande pendant ce glissement, c'est la manquer : on
// attend qu'il soit arrivé, comme le ferait l'œil.
async function allerALaDemo(page) {
  await page.locator('#demo').scrollIntoViewIfNeeded()
  await page.waitForFunction(
    () => {
      const téléphone = document.querySelector('#demo .phone')
      return téléphone?.classList.contains('est-visible') && téléphone.getAnimations().length === 0
    },
    null,
    { timeout: 5000 }
  )
}

const browser = await chromium.launch(
  optionsDeLancement({
    // Sans carte graphique, Chromium refuse WebGL et le film basculerait
    // sur l'image fixe — la vérification passerait sans avoir rien vérifié. On
    // lui impose le rendu logiciel pour tester le vrai chemin.
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  })
)

// Toute ressource refusée par la politique de sécurité (CSP), sur toutes les
// pages de toutes les vérifications. Chromium les signale dans la console.
const violationsCSP = []
const nouveauContexte = browser.newContext.bind(browser)
browser.newContext = async (...options) => {
  const context = await nouveauContexte(...options)
  context.on('page', (page) => {
    page.on('console', (message) => {
      if (/Content Security Policy/i.test(message.text())) violationsCSP.push(message.text())
    })
  })
  return context
}

// --- En-têtes de sécurité -------------------------------------------------

{
  const reponse = await fetch(base)
  const entete = (nom) => reponse.headers.get(nom) ?? ''
  const csp = entete('content-security-policy')
  check(
    /default-src 'self'/.test(csp) && /script-src 'self' 'wasm-unsafe-eval'(;|$)/.test(csp),
    'la politique de sécurité (CSP) n’autorise que le site lui-même, et son WebAssembly',
    csp
  )
  // 'wasm-unsafe-eval' autorise la compilation du WebAssembly, pas eval() :
  // c'est le seul assouplissement admis.
  check(!/'unsafe-inline'|'unsafe-eval'/.test(csp), 'aucun script ni style en ligne autorisé sur le site', csp)
  check(/style-src 'self'(;|$)/.test(csp), 'aucun style en ligne autorisé, pas même en attribut', csp)
  check(/frame-ancestors 'none'/.test(csp) && entete('x-frame-options') === 'DENY', 'le site refuse d’être affiché dans un cadre (clickjacking)')
  check(entete('x-content-type-options') === 'nosniff', 'X-Content-Type-Options: nosniff')
  check(entete('referrer-policy') === 'strict-origin-when-cross-origin', 'Referrer-Policy stricte')
  check(entete('cross-origin-opener-policy') === 'same-origin', 'Cross-Origin-Opener-Policy: same-origin')
  check(/camera=\(\)/.test(entete('permissions-policy')) && /gyroscope=\(self\)/.test(entete('permissions-policy')), 'Permissions-Policy : caméra coupée, gyroscope gardé pour l’inclinaison')
  check(!reponse.headers.has('x-powered-by'), 'le serveur ne dit pas ce qu’il est')

  const index = await reponse.text()
  check(!/<script>(?!\s*<\/script>)/.test(index) && !/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(index), 'aucun script en ligne dans la page')
  check(!/fonts\.(googleapis|gstatic)\.com/.test(index), 'aucune police chargée depuis Google')

  const redirection = await fetch(`${base}/demo?x=1`, { redirect: 'manual', headers: { 'x-forwarded-proto': 'http' } })
  check(
    redirection.status === 301 && (redirection.headers.get('location') ?? '').startsWith('https://') && (redirection.headers.get('location') ?? '').endsWith('/demo?x=1'),
    'une visite en clair est renvoyée vers HTTPS',
    `${redirection.status} ${redirection.headers.get('location')}`
  )
  const detournee = await fetch(`${base}/demo`, {
    redirect: 'manual',
    headers: { 'x-forwarded-proto': 'http', 'x-forwarded-host': 'ailleurs.example' }
  })
  check(
    detournee.status === 301 && !(detournee.headers.get('location') ?? '').includes('ailleurs.example'),
    'la redirection HTTPS ne suit pas un hôte écrit par le visiteur',
    `${detournee.status} ${detournee.headers.get('location')}`
  )
  const chiffree = await fetch(base, { headers: { 'x-forwarded-proto': 'https' } })
  check(/max-age=\d{8}/.test(chiffree.headers.get('strict-transport-security') ?? ''), 'HSTS envoyé en HTTPS')

  const manquant = await fetch(`${base}/assets/nexiste-pas.js`)
  check(manquant.status === 404, 'un fichier versionné absent renvoie 404, pas la page', String(manquant.status))
  const texteManquant = await manquant.text()
  check(!/Error|at |\/app\/|node_modules/.test(texteManquant), 'une erreur ne dévoile rien du serveur', texteManquant.slice(0, 80))
}

// --- Consoles qui refusent : ce qui marche --------------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  const cartes = page.locator('.route-card')
  check((await cartes.count()) === 3, 'PS5, Xbox et Switch ont chacune leur carte « ce qui marche »')
  const etapes = await cartes.evaluateAll((noeuds) => noeuds.map((n) => n.querySelectorAll('.route-steps li').length))
  check(
    etapes.every((n) => n === 3),
    'PS5, Xbox et Switch : chacune ses étapes, y compris la Switch par le boîtier',
    etapes.join(', ')
  )
  await context.close()
}

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

    // La page elle-même ne défilait pas de côté — mais la rangée des macros,
    // si, et le cadre de l'iPad dépassait de l'écran, rogné sans rien dire.
    // Ni bande à faire glisser latéralement, ni contenu qui sort de l'écran.
    const deCote = await page.evaluate(() => {
      const largeur = document.documentElement.clientWidth
      const bandes = []
      const dehors = []
      for (const el of document.querySelectorAll('main *, header *, footer *')) {
        const style = getComputedStyle(el)
        if (['auto', 'scroll'].includes(style.overflowX) && el.scrollWidth > el.clientWidth + 1) {
          bandes.push(el.className || el.tagName)
        }
        // Les décors du haut de page et les dessins SVG sont rognés par leur
        // cadre : seuls comptent les éléments qu'on lit ou qu'on touche.
        if (el.closest('svg, canvas, .scene, .bande, .footer-grand, .visually-hidden, .skip-link')) continue
        const boite = el.getBoundingClientRect()
        if (boite.width > 0 && (boite.right > largeur + 0.5 || boite.left < -0.5)) {
          dehors.push(`${String(el.className).split(' ')[0] || el.tagName} ${Math.round(boite.left)}→${Math.round(boite.right)}`)
        }
      }
      return { bandes, dehors: dehors.slice(0, 4) }
    })
    check(deCote.bandes.length === 0, `aucune bande à faire défiler de côté à ${width} px (${scheme})`, deCote.bandes.join(', '))
    check(deCote.dehors.length === 0, `rien ne sort de l’écran à ${width} px (${scheme})`, deCote.dehors.join(', '))
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
  await allerALaDemo(page)

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

  // Une commande verrouillée ne se déplace plus. On compare sa position
  // logique — l'attribut `transform` que la démo pose elle-même — et non sa
  // boîte à l'écran : celle-ci bouge aussi quand la page défile ou pendant
  // le glissement animé, et le contrôle échouait de loin en loin en CI sans
  // que la commande ait bougé.
  await attendreImmobiles(page)
  const verrouillee = page.locator('[data-control="L2"]')
  const positionAvant = await verrouillee.getAttribute('transform')
  const boite = await verrouillee.boundingBox()
  await page.mouse.move(boite.x + boite.width / 2, boite.y + boite.height / 2)
  await page.mouse.down()
  await page.mouse.move(boite.x + boite.width / 2 - 100, boite.y + boite.height / 2, { steps: 10 })
  await page.mouse.up()
  await page.waitForTimeout(200)
  const positionApres = await verrouillee.getAttribute('transform')
  check(
    positionAvant !== null && positionAvant === positionApres,
    'une commande verrouillée refuse de bouger',
    `${positionAvant} → ${positionApres}`
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

  const immobiles = () => attendreImmobiles(page)

  const curseur = page
    .locator('.demo-controls')
    .getByLabel(/^(Espacement|Spacing|Separación)$/)
  // Des cibles assez petites pour que l'écart demandé tienne : à 100 points,
  // c'est l'écart qui cède d'abord, et la mesure ne verrait plus rien bouger.
  await page.locator('.demo-controls').getByLabel(/^(Taille des cibles|Target size|Tamaño de los objetivos)$/).fill('60')
  await curseur.fill('1.1')
  await page.waitForTimeout(50)
  await immobiles()
  const serre = await ecartMinimal()
  await curseur.fill('2')
  await page.waitForTimeout(50)
  await immobiles()
  const large = await ecartMinimal()

  check(large > serre, "le curseur d'espacement écarte réellement les commandes", `${serre.toFixed(1)} px → ${large.toFixed(1)} px`)

  // --- Toute la plage : 44 à 100 points, jusqu'à ×2 ------------------------
  //
  // Les curseurs vont jusqu'au bout, et le bout fonctionne : sur l'iPad,
  // 100 points sont réellement tenus ; sur l'iPhone, l'écran le dit quand il
  // ne peut pas suivre. Et pousser le curseur ne rapetisse jamais les
  // boutons — l'ancien solveur le faisait, par pas de 4 %.
  const taille = page.locator('.demo-controls').getByLabel(/^(Taille des cibles|Target size|Tamaño de los objetivos)$/)
  const bornes = async (loc) => [await loc.getAttribute('min'), await loc.getAttribute('max')].map(Number)
  const [tMin, tMax] = await bornes(taille)
  const [, eMax] = await bornes(curseur)
  check(tMin === 44 && tMax === 150, 'la taille des cibles va de 44 à 150 points', `${tMin} → ${tMax}`)
  check(eMax === 2, "l'espacement va jusqu'à ×2", `max ${eMax}`)

  const valeurs = () =>
    page.evaluate(() => {
      const lire = (nom) => {
        const el = document.querySelector(`[data-valeur="${nom}"]`)
        return { demande: Number(el.dataset.demande), tenue: Number(el.dataset.tenue), texte: el.textContent.trim() }
      }
      return { cible: lire('cible'), espacement: lire('espacement') }
    })

  // Dans les coordonnées du dessin : largeur rendue ramenée aux points de
  // l'appareil dessiné.
  const disposition = () =>
    page.evaluate(() => {
      const svg = document.querySelector('.phone-screen')
      const cadre = svg.getBoundingClientRect()
      const echelle = svg.viewBox.baseVal.width / cadre.width
      const commandes = [...document.querySelectorAll('.control:not(.is-hidden-control)')].map((el) => {
        const r = el.querySelector('.control-shape').getBoundingClientRect()
        return { id: el.dataset.control, left: r.left, right: r.right, top: r.top, bottom: r.bottom, largeur: r.width * echelle }
      })
      // Chaque commande a un rayon d'encombrement — la moitié du diamètre
      // pour un bouton rond, de la diagonale pour une pilule — comme dans le
      // solveur : deux commandes se chevauchent si leurs centres sont plus
      // proches que la somme de ces rayons.
      const rayon = (c) => Math.hypot(c.right - c.left, c.bottom - c.top) / (Math.abs(c.right - c.left - (c.bottom - c.top)) < 1 ? 2 * Math.SQRT2 : 2)
      let chevauchements = 0
      for (let i = 0; i < commandes.length; i += 1) {
        for (let j = i + 1; j < commandes.length; j += 1) {
          const a = commandes[i]
          const b = commandes[j]
          const d = Math.hypot((a.left + a.right - b.left - b.right) / 2, (a.top + a.bottom - b.top - b.bottom) / 2)
          if (d < rayon(a) + rayon(b) - 1) chevauchements += 1
        }
      }
      const dehors = commandes.filter(
        (c) => c.left < cadre.left - 1 || c.right > cadre.right + 1 || c.top < cadre.top - 1 || c.bottom > cadre.bottom + 1
      ).length
      const faceS = commandes.find((c) => c.id === 'faceS')
      return { nombre: commandes.length, chevauchements, dehors, faceS: faceS?.largeur ?? 0 }
    })

  const appareil = (nom) => page.locator('.demo-controls').getByRole('button', { name: nom, exact: true }).click()

  await appareil('iPad')
  await curseur.fill('1.35')
  let precedente = 0
  let recul = ''
  for (const cran of ['1.35', '2']) {
    await curseur.fill(cran)
    precedente = 0
    for (let demande = 44; demande <= 150; demande += 2) {
      await taille.fill(String(demande))
      const { cible } = await valeurs()
      if (cible.tenue < precedente || cible.tenue > demande || cible.tenue < 44) {
        recul ||= `×${cran} : ${demande} pt demandés → ${cible.tenue} (avant : ${precedente})`
      }
      precedente = cible.tenue
    }
  }
  check(recul === '', 'pousser le curseur de taille ne rapetisse jamais les boutons, sur toute la plage', recul)

  await curseur.fill('1.35')
  await taille.fill('100')
  await page.waitForTimeout(50)
  await immobiles()
  let v = await valeurs()
  let d = await disposition()
  check(
    v.cible.tenue === 100 && v.cible.texte.replace(/\s+/g, ' ') === '100 pt',
    "sur l'iPad, 100 points sont réellement tenus",
    v.cible.texte
  )
  check(Math.abs(d.faceS - 100) < 2, "et dessinés à 100 points de l'iPad", `${d.faceS.toFixed(1)} pt`)
  check(d.nombre === 18 && d.chevauchements === 0 && d.dehors === 0, "à 100 points, toutes les commandes tiennent sur l'iPad sans se chevaucher", JSON.stringify(d))

  await curseur.fill('2')
  await page.waitForTimeout(50)
  await immobiles()
  v = await valeurs()
  d = await disposition()
  // C'est l'écart qui cède, pas la taille : les boutons restent à 100.
  check(
    v.cible.tenue === 100 && v.espacement.tenue < 2 && v.espacement.texte.includes('×2.00 → ×'),
    "à ×2, l'iPad garde ses 100 points et resserre l'écart",
    `${v.cible.texte} · ${v.espacement.texte}`
  )
  check(d.nombre === 18 && d.chevauchements === 0 && d.dehors === 0, 'à ×2 et 100 points, rien ne se chevauche ni ne sort', JSON.stringify(d))

  await appareil('iPhone')
  await page.waitForTimeout(50)
  await immobiles()
  v = await valeurs()
  d = await disposition()
  check(
    // 57 points avec la croix, le stick et l'arc de vision ; 44 quand les
    // cibles cédaient avant l'écart.
    v.cible.tenue < 100 && v.cible.tenue >= 55 && v.cible.texte.includes(`100 → ${v.cible.tenue}`),
    "sur l'iPhone, le curseur dit ce qui est demandé et ce que l'écran tient — plus de 55 points",
    v.cible.texte
  )
  check(
    (await page.locator('.control-block:has([data-valeur="cible"]) .hint').count()) === 1,
    "et explique pourquoi l'écran réduit"
  )
  check(d.nombre === 18 && d.chevauchements === 0 && d.dehors === 0, "à 100 points et ×2, l'iPhone garde toutes ses commandes, sans chevauchement", JSON.stringify(d))

  await appareil('iPad')
  await taille.fill('150')
  await curseur.fill('1.35')
  await page.waitForTimeout(50)
  await immobiles()
  v = await valeurs()
  d = await disposition()
  check(v.cible.tenue >= 110, "au bout du curseur, l'iPad pose ses dix-huit commandes à plus de 110 points", v.cible.texte)
  check(d.nombre === 18 && d.chevauchements === 0 && d.dehors === 0, 'à 150 points demandés, rien ne se chevauche ni ne sort', JSON.stringify(d))
  await context.close()
}

// --- La croix directionnelle, sur toutes les manettes ---------------------
//
// Une vraie manette a un stick *et* une croix. La démonstration n'avait que
// le stick : impossible de naviguer dans un menu comme on le ferait avec la
// manette d'origine.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await allerALaDemo(page)

  const noms = ['Nintendo Switch', 'PlayStation', 'Xbox', 'Steam Deck / PC', /^(Rétro|Retro)/, /^(Ordinateur|Computer|Ordenador)$/]
  const sansCroix = []
  for (const nom of noms) {
    await page.locator('.demo-controls').getByRole('button', { name: nom }).first().click()
    await page.waitForTimeout(80)
    const croix = await page.locator('.control[data-control="dpad"]').count()
    const stick = await page.locator('.control[data-control="directional"]').count()
    if (croix !== 1 || stick !== 1) sansCroix.push(String(nom))
  }
  check(sansCroix.length === 0, 'chaque manette a sa croix directionnelle, à côté du stick', sansCroix.join(', '))
  await page.locator('.demo-controls').getByRole('button', { name: 'Nintendo Switch' }).first().click()

  const croix = page.locator('.control[data-control="dpad"]')
  const branches = () =>
    page.evaluate(() =>
      [...document.querySelectorAll('.control[data-control="dpad"] .dpad-arm.is-active')].map((el) =>
        el.parentNode.getAttribute('transform')
      )
    )
  await page.waitForTimeout(600)
  const boite = await croix.boundingBox()
  // Appui à droite du centre : seule la branche droite s'allume.
  await croix.click({ position: { x: boite.width * 0.88, y: boite.height / 2 } })
  await page.waitForTimeout(120)
  check(
    JSON.stringify(await branches()) === JSON.stringify(['rotate(90)']),
    'appuyer à droite sur la croix n’allume que la branche droite',
    JSON.stringify(await branches())
  )
  // Même en mode verrouillant, la croix reste en appui direct, comme dans
  // l'application : verrouillée, elle ferait tourner le personnage sans fin.
  await page.waitForTimeout(500)
  check((await branches()).length === 0, 'la croix se relâche seule, même en mode verrouillant', JSON.stringify(await branches()))
  await croix.focus()
  await page.keyboard.press('ArrowDown')
  await page.waitForTimeout(120)
  check(
    JSON.stringify(await branches()) === JSON.stringify(['rotate(180)']) &&
      (await croix.getAttribute('aria-pressed')) === 'true',
    'au clavier, les flèches actionnent la croix',
    JSON.stringify(await branches())
  )
  await page.waitForTimeout(500)

  // La croix se masque comme les autres commandes, et rend sa place.
  await page.locator('.demo-controls').getByRole('button', { name: /^(Modifier|Edit|Editar)$/ }).click()
  await croix.click()
  await page.locator('.control-panel').getByRole('button', { name: /^(Masquer|Hide|Ocultar)$/ }).click()
  await page.waitForTimeout(150)
  check(
    (await croix.count()) === 0 && (await page.locator('[data-hidden-control="dpad"]').count()) === 1,
    'la croix se masque, et reste récupérable'
  )
  await context.close()
}

// --- L'arc de vision, et une disposition par console ----------------------
//
// Un arc de quatre boutons déplace le champ de vision, comme le stick droit.
// Il n'existe que sur les consoles qui ont une caméra à piloter ; le stick
// caméra, lui, attend d'être demandé. Et chaque console peut garder sa
// propre disposition.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await allerALaDemo(page)
  const consoleBouton = (nom) => page.locator('.demo-controls').getByRole('button', { name: nom }).first()
  const vision = () => page.locator('.control[data-control^="look"]').count()

  check((await vision()) === 4, "la Switch a son arc de vision : quatre boutons", String(await vision()))
  check(
    (await page.locator('.control[data-control="cameraStick"]').count()) === 0,
    'le stick caméra est masqué tant qu’on ne l’a pas demandé'
  )
  await consoleBouton(/^(Rétro|Retro)/).click()
  await page.waitForTimeout(80)
  check((await vision()) === 0, 'les jeux rétro n’ont pas d’arc de vision : pas de caméra à piloter', String(await vision()))
  await consoleBouton('Nintendo Switch').click()

  // Tenir un bouton de vision : il s'allume, puis s'éteint seul — appui
  // direct, jamais verrouillé.
  await page.waitForTimeout(600)
  await page.locator('.control[data-control="lookLeft"]').click()
  await page.waitForTimeout(80)
  const allume = await page.locator('.control[data-control="lookLeft"]').getAttribute('aria-pressed')
  await page.waitForTimeout(500)
  const eteint = await page.locator('.control[data-control="lookLeft"]').getAttribute('aria-pressed')
  check(allume === 'true' && eteint === 'false', 'un bouton de vision agit tant qu’on le tient, sans se verrouiller', `${allume} → ${eteint}`)

  // Une disposition propre à la Switch : masquer un bouton ne touche qu'elle.
  const propre = page.locator('.demo-controls').getByRole('button', { name: /^(Disposition propre à|Own layout for|Disposición propia para) Nintendo Switch$/ })
  await propre.click()
  check((await propre.getAttribute('aria-pressed')) === 'true', 'la Switch peut garder sa propre disposition')
  await page.locator('.demo-controls').getByRole('button', { name: /^(Modifier|Edit|Editar)$/ }).click()
  await page.locator('[data-control="faceS"]').click()
  await page.locator('.control-panel').getByRole('button', { name: /^(Masquer|Hide|Ocultar)$/ }).click()
  await page.waitForTimeout(100)
  const surSwitch = await page.locator('[data-control="faceS"]').count()
  await consoleBouton('PlayStation').click()
  await page.waitForTimeout(100)
  const surPlayStation = await page.locator('[data-control="faceS"]').count()
  check(
    surSwitch === 0 && surPlayStation === 1,
    'masqué sur la Switch, un bouton reste sur la PlayStation',
    `Switch ${surSwitch}, PlayStation ${surPlayStation}`
  )
  await context.close()
}

// --- Des boutons assez gros pour se voir sur un téléphone -----------------
//
// La démonstration dessine un vrai iPad, deux fois plus large qu'un
// téléphone : à 70 points par défaut, ses boutons faisaient 31 pixels sur
// l'écran d'un iPhone. Trop petit — on nous l'a dit.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  const largeur = await page.evaluate(
    () => document.querySelector('.control[data-control="faceS"] .control-shape').getBoundingClientRect().width
  )
  check(largeur >= 42, "sur un téléphone, les boutons de la démonstration font plus de 42 pixels", `${largeur.toFixed(1)} px`)
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

// --- La porte d'entrée -----------------------------------------------------
//
// Le signe se trace pendant le chargement du programme, puis la porte se
// lève. Elle ne doit jamais rester fermée sur la page.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const fermée = await page.evaluate(() => getComputedStyle(document.querySelector('.porte')).visibility)
  check(fermée === 'visible', 'la porte couvre la page pendant le chargement', fermée)
  const ouverte = await page
    .waitForFunction(
      () =>
        document.documentElement.classList.contains('programme-pret') &&
        getComputedStyle(document.querySelector('.porte')).visibility === 'hidden',
      null,
      { timeout: 6000 }
    )
    .then(() => true)
    .catch(() => false)
  check(ouverte, 'le programme prêt, la porte se lève')
  check(errors.length === 0, 'aucune erreur JavaScript au démarrage du programme', errors.join(' | '))
  await context.close()
}

// Le programme ne se charge pas : la porte s'ouvre quand même, et la page
// garde son contenu de secours plutôt qu'un écran vide.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.route(/\.wasm$/, (route) => route.abort())
  await page.goto(base, { waitUntil: 'domcontentloaded' })
  const ouverte = await page
    .waitForFunction(() => getComputedStyle(document.querySelector('.porte')).visibility === 'hidden', null, {
      timeout: 9000
    })
    .then(() => true)
    .catch(() => false)
  check(ouverte, 'sans le programme, la porte finit par s’ouvrir')
  await context.close()
}

// --- Le film de grains ------------------------------------------------------

const station = (page) => page.evaluate(() => document.querySelector('#ouverture .scene')?.dataset.station)

// Descendre la piste jusqu'à une fraction de sa course, sans douceur.
const allerDansLaPiste = (page, fraction) =>
  page.evaluate((f) => {
    const piste = document.querySelector('#ouverture .piste')
    const haut = piste.getBoundingClientRect().top + window.scrollY
    const course = piste.offsetHeight - 2 * window.innerHeight
    window.scrollTo({ top: haut + course * f, behavior: 'instant' })
  }, fraction)

for (const [largeur, hauteur] of [
  [1280, 800],
  [390, 844]
]) {
  const à = ` (${largeur}×${hauteur})`
  const context = await browser.newContext({ viewport: { width: largeur, height: hauteur } })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(String(error)))
  await page.goto(base, { waitUntil: 'networkidle' })

  const ouverture = page.locator('#ouverture')
  check((await ouverture.getAttribute('class'))?.includes('est-fixe') === false, 'le film tourne quand les animations sont permises' + à)
  const canevas = await page.evaluate(() => {
    const c = document.querySelector('#ouverture canvas.film')
    return c ? { largeur: c.width, hauteur: c.height } : null
  })
  check(canevas !== null && canevas.largeur > 0 && canevas.hauteur > 0, 'le canevas WebGL a une taille réelle' + à, JSON.stringify(canevas))
  check((await station(page)) === '0', 'en haut de page, le film montre la marque' + à, String(await station(page)))

  // Une scène immobile ne serait qu'une image : deux captures espacées
  // doivent différer. Des captures d'écran, pas `toDataURL` : sans
  // `preserveDrawingBuffer`, le tampon WebGL est vidé une fois l'image
  // composée, et deux rectangles vides se ressemblent beaucoup.
  const scène = page.locator('#ouverture .scene')
  const avant = await scène.screenshot()
  await page.waitForTimeout(700)
  const après = await scène.screenshot()
  check(!avant.equals(après), 'les grains bougent réellement entre deux captures' + à)

  // Chaque ligne du film a sa station : le défilement les fait venir dans
  // l'ordre, une seule visible à la fois.
  const lues = []
  for (let n = 1; n <= 5; n += 1) {
    await allerDansLaPiste(page, n / 6)
    // Les mots montent l'un après l'autre (750 ms, plus 45 ms par mot) :
    // on attend que la ligne ait fini d'arriver.
    await page
      .waitForFunction(
        (s) =>
          document.querySelector('#ouverture .scene')?.dataset.station === s &&
          [...document.querySelectorAll(`#ouverture .station[data-index="${s}"] .mot-dedans`)].every(
            (m) => getComputedStyle(m).transform === 'none'
          ),
        String(n),
        { timeout: 5000 }
      )
      .catch(() => undefined)
    await page.waitForTimeout(450)
    const relevé = await page.evaluate((s) => {
      // Une ligne lisible : ses mots sont remontés dans leur fenêtre (aucune
      // translation) et son numéro est allumé.
      const visibles = [...document.querySelectorAll('#ouverture .station')].filter((li) => {
        const mots = [...li.querySelectorAll('.mot-dedans')]
        const numéro = li.querySelector('.station-numero')
        return (
          mots.length > 0 &&
          mots.every((m) => getComputedStyle(m).transform === 'none') &&
          Number(getComputedStyle(numéro).opacity) > 0.9
        )
      })
      return {
        station: document.querySelector('#ouverture .scene')?.dataset.station,
        visibles: visibles.map((li) => li.dataset.index),
        texte: visibles[0]?.querySelector('.station-texte')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      }
    }, String(n))
    lues.push(relevé.texte)
    check(
      relevé.station === String(n) && relevé.visibles.length === 1 && relevé.visibles[0] === String(n),
      `station ${n} : sa ligne, et elle seule, est lisible` + à,
      JSON.stringify(relevé)
    )
  }
  check(new Set(lues).size === 5 && lues.every((t) => t.length > 8), 'les cinq lignes du film sont toutes différentes' + à, lues.join(' / '))

  // Au bout de la piste, la dernière forme, et l'accueil par-dessus.
  await allerDansLaPiste(page, 1)
  await page.waitForTimeout(500)
  check((await station(page)) === '6', 'au bout de la piste, la dernière forme' + à, String(await station(page)))

  // « Passer l'intro » mène droit à l'accueil.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await page.waitForTimeout(300)
  await page.locator('#ouverture .passer').click()
  const arrivé = await page
    .waitForFunction(() => Math.abs(document.getElementById('accueil').getBoundingClientRect().top) < 4, null, { timeout: 4000 })
    .then(() => true)
    .catch(() => false)
  check(arrivé, '« Passer l’intro » mène à l’accueil' + à, String(await page.evaluate(() => document.getElementById('accueil').getBoundingClientRect().top)))
  check(await page.locator('#accueil h1').isVisible(), 'le titre de l’accueil est lisible après l’intro' + à)

  check(errors.length === 0, 'aucune erreur JavaScript pendant le film' + à, errors.join(' | '))
  await context.close()
}

// Le curseur sur mesure et le défilement doux : seulement avec une souris.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.mouse.move(400, 400)
  await page.mouse.move(640, 420, { steps: 4 })
  const classes = await page.evaluate(() => document.documentElement.className)
  check(/curseur-actif/.test(classes) && /curseur-visible/.test(classes), 'avec une souris, le curseur sur mesure suit le pointeur', classes)
  check(/defilement-doux/.test(classes), 'avec une souris, le défilement est adouci', classes)

  // Le bouton aimanté se laisse attirer par le pointeur, puis revient.
  await page.locator('#ouverture .passer').click()
  await page.waitForFunction(() => Math.abs(document.getElementById('accueil').getBoundingClientRect().top) < 2, null, { timeout: 6000 })
  const bouton = page.locator('.hero-actions .button.primary')
  const boîte = await bouton.boundingBox()
  await page.mouse.move(boîte.x + boîte.width / 2 + boîte.width * 0.4, boîte.y + boîte.height / 2 + 10, { steps: 6 })
  await page.waitForTimeout(400)
  const attiré = await bouton.evaluate((n) => getComputedStyle(n).translate)
  check(attiré !== 'none' && attiré !== '0px', 'un bouton aimanté suit le pointeur', attiré)
  await page.mouse.move(40, 760, { steps: 4 })
  await page.waitForTimeout(500)
  const relâché = await bouton.evaluate((n) => getComputedStyle(n).translate)
  check(relâché === 'none' || /^0px( 0px)?$/.test(relâché), 'le bouton revient en place quand le pointeur s’éloigne', relâché)
  await context.close()
}
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  const classes = await page.evaluate(() => document.documentElement.className)
  check(!/curseur-actif|defilement-doux/.test(classes), 'au doigt, ni curseur sur mesure ni défilement détourné', classes)
  await context.close()
}

// Réglage système « Réduire les animations » : pas de film, pas de porte,
// les lignes se lisent d'un bloc et l'image fixe montre l'appareil.
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
  const relevé = await page.evaluate(() => ({
    fixe: document.getElementById('ouverture').classList.contains('est-fixe'),
    canevas: document.querySelectorAll('canvas').length,
    image: Boolean(document.querySelector('#accueil .hero-still')),
    porte: getComputedStyle(document.querySelector('.porte')).display,
    grain: getComputedStyle(document.querySelector('.grain')).display,
    lignes: [...document.querySelectorAll('#ouverture .station .mot-dedans')].every((n) => Number(getComputedStyle(n).opacity) === 1),
    curseur: document.documentElement.classList.contains('curseur-actif')
  }))
  check(relevé.fixe && relevé.canevas === 0, 'animations réduites : aucun film, aucun canevas', JSON.stringify(relevé))
  check(relevé.image, 'animations réduites : l’accueil montre l’image fixe de l’appareil')
  check(relevé.porte === 'none' && relevé.grain === 'none', 'animations réduites : ni porte ni grain', JSON.stringify(relevé))
  check(relevé.lignes, 'animations réduites : toutes les lignes du film se lisent d’emblée')
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
  const fixe = () => page.evaluate(() => document.getElementById('ouverture').classList.contains('est-fixe'))

  await animations.getByRole('button', { name: /^(Apaisées|Calm|En calma)$/ }).click()
  await page.waitForTimeout(250)
  check(await fixe(), 'le réglage « apaisées » arrête le film')
  check((await page.locator('canvas.film').count()) === 0, 'le réglage « apaisées » retire le canevas')
  check(
    (await page.evaluate(() => document.documentElement.dataset.motion)) === 'reduced',
    'le choix est exposé au CSS'
  )

  // Le choix doit survivre à un rechargement : un réglage d'accessibilité
  // qu'il faut reprendre à chaque visite n'en est pas un.
  await page.reload({ waitUntil: 'networkidle' })
  await page.waitForTimeout(250)
  check(await fixe(), 'le réglage « apaisées » survit au rechargement')

  await page.locator('.preference-animation').getByRole('button', { name: /^(Animées|Animated|Animadas)$/ }).click()
  await page.waitForTimeout(400)
  check(!(await fixe()) && (await page.locator('canvas.film').count()) === 1, 'le réglage « animées » rallume le film')
  await context.close()
}
{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('.preference-animation').getByRole('button', { name: /^(Animées|Animated|Animadas)$/ }).click()
  await page.waitForTimeout(400)
  check((await page.locator('canvas.film').count()) === 1, 'le réglage « animées » l’emporte sur un système qui demande le calme')
  await context.close()
}

// --- Les commandes glissent, elles ne sautent pas -------------------------

{
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await allerALaDemo(page)
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
  await page.locator('#demo').getByRole('button', { name: /^(Gauche|Left|Izquierda)$/ }).click()
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

  check(await opacité('#partage .share-panel') < 1, 'un bloc hors écran attend son tour')
  await page.locator('#partage').scrollIntoViewIfNeeded()
  await page.waitForTimeout(1200)
  check(await opacité('#partage .share-panel') === 1, 'le bloc apparaît quand on arrive dessus')

  // Aucune section ne doit rester coincée une fois la page parcourue.
  // Bloc par bloc : un saut de section en section en laissait passer
  // certains sans qu'ils croisent jamais l'écran.
  const blocs = await page.locator('[data-reveler]').count()
  for (let i = 0; i < blocs; i += 1) {
    await page.locator('[data-reveler]').nth(i).scrollIntoViewIfNeeded()
    await page.waitForTimeout(60)
  }
  await page.waitForTimeout(1200)
  const restées = await page.evaluate(() =>
    [...document.querySelectorAll('[data-reveler]')]
      .filter((n) => !n.classList.contains('est-visible') || Number(getComputedStyle(n).opacity) < 1)
      .map((n) => n.className)
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
    [...document.querySelectorAll('[data-reveler], .mot-dedans')].map((n) => Number(getComputedStyle(n).opacity))
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
    const position = await page.evaluate(async (id) => {
      const élément = id === 'pied' ? document.querySelector('footer') : document.getElementById(id)
      // Le défilement fini ne suffit pas : une section qui apparaît glisse
      // encore de quelques pixels. On attend qu'elle soit immobile elle aussi
      // (dix images d'affilée, deux secondes au plus) avant de la mesurer.
      await new Promise((résoudre) => {
        let dernier = NaN
        let stable = 0
        const début = performance.now()
        const regarder = () => {
          const haut = élément.getBoundingClientRect().top
          stable = haut === dernier ? stable + 1 : 0
          dernier = haut
          if (stable >= 10 || performance.now() - début > 2000) résoudre()
          else requestAnimationFrame(regarder)
        }
        requestAnimationFrame(regarder)
      })
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

// Sur ordinateur : pas de bouton, la souris écarte déjà les grains.
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  check(
    (await page.locator('.tilt-toggle').count()) === 0,
    'sur ordinateur, pas de bouton d’inclinaison — la souris suffit'
  )
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

  const bouton = page.locator('.tilt-toggle')
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
      () => document.querySelector('.tilt-toggle')?.getAttribute('aria-pressed') === 'true',
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
    'le gyroscope atteint bien le film'
  )
  check((await page.locator('.inclinaison .hint').count()) === 0, 'aucun message d’erreur quand tout fonctionne')

  await bouton.tap()
  await page.waitForTimeout(200)
  check((await bouton.getAttribute('aria-pressed')) === 'false', 'un second appui éteint le suivi')
  // Le capteur simulé continue d'émettre : éteint, le suivi doit l'ignorer.
  await page.waitForTimeout(300)
  check(
    (await page.evaluate(() => document.documentElement.dataset.inclinaison)) === undefined,
    'éteindre le suivi remet le film droit'
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
  await page.locator('.tilt-toggle').tap()
  await page.waitForTimeout(2000)
  check(
    (await page.locator('.tilt-toggle').getAttribute('aria-pressed')) === 'false',
    'sans capteur, le suivi ne prétend pas être allumé'
  )
  check(
    ((await page.locator('.inclinaison .hint').textContent().catch(() => '')) ?? '').trim().length > 0,
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
    (await page.locator('.tilt-toggle').count()) === 0,
    'animations réduites : pas de suivi d’inclinaison proposé'
  )
  await context.close()
}

// --- Les ombres des éléments colorés --------------------------------------

for (const thème of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.evaluate((t) => localStorage.setItem('hemipad.theme', t), thème)
  await page.reload({ waitUntil: 'networkidle' })

  const relevé = await page.evaluate(() => {
    const style = (sélecteur) => {
      const élément = document.querySelector(sélecteur)
      return élément ? getComputedStyle(élément) : null
    }
    const forme = document.querySelector('[data-control] .control-shape')
    return {
      bouton: style('.button.primary')?.boxShadow ?? 'absent',
      icône: style('.feature-icon')?.boxShadow ?? 'absent',
      titre: style('.gradient-text')?.filter ?? 'absent',
      chiffres: style('.hero-stats dd')?.textShadow ?? 'absent',
      surtitre: style('.eyebrow')?.textShadow ?? 'absent',
      filtreCommande: forme?.getAttribute('filter') ?? 'absent',
      filtreCssCommande: forme ? getComputedStyle(forme).filter : 'absent',
      filtreDéfini: Boolean(document.getElementById('ombre-commande'))
    }
  })

  const à = ` (${thème === 'dark' ? 'sombre' : 'clair'})`
  check(relevé.bouton !== 'none' && relevé.bouton !== 'absent', 'le bouton principal porte une ombre' + à, relevé.bouton)
  check(relevé.icône !== 'none' && relevé.icône !== 'absent', 'les icônes colorées portent une ombre' + à, relevé.icône)
  check(relevé.titre.includes('drop-shadow'), 'le titre en dégradé porte une ombre' + à, relevé.titre)
  check(relevé.chiffres !== 'none' && relevé.chiffres !== 'absent', 'les chiffres colorés portent une ombre' + à, relevé.chiffres)
  // Le petit texte coloré n'en a pas : une ombre sur des lettres de onze
  // pixels les brouille. C'est un choix, on le garde.
  check(relevé.surtitre === 'none', 'le petit texte coloré reste net, sans ombre' + à, relevé.surtitre)
  // Safari ne peint pas un `drop-shadow` CSS posé sur un élément de dessin
  // SVG : l'ombre des commandes doit passer par le filtre SVG, sans quoi elle
  // serait visible partout sauf sur un iPhone.
  check(
    relevé.filtreDéfini && relevé.filtreCommande === 'url(#ombre-commande)',
    'les commandes de la démo portent le filtre d’ombre SVG' + à,
    relevé.filtreCommande
  )
  // L'attribut SVG se reflète dans le style calculé (`url("#…")`) : c'est
  // normal. Ce qui est interdit, c'est une *fonction* de filtre CSS.
  check(
    !relevé.filtreCssCommande.includes('drop-shadow'),
    'aucune ombre de commande ne passe par un filtre CSS, invisible sur Safari' + à,
    relevé.filtreCssCommande
  )
  await context.close()
}

// --- La main valide et l'appareil, partagés par tout le site -------------
//
// L'accueil propose les deux choix, et ce sont les mêmes que dans la
// démonstration : le film (ou l'image fixe) redessine la main et l'appareil.
for (const motion of ['no-preference', 'reduce']) {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: motion
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  const cas = motion === 'reduce' ? 'image fixe' : 'film'
  const sousImage = page.locator('.choix-main')
  const démo = page.locator('#demo')
  const pressé = (portée, nom) =>
    portée.getByRole('button', { name: nom, exact: true }).getAttribute('aria-pressed')
  const rendue = (main) =>
    page
      .waitForFunction(
        (m) => document.querySelector('#ouverture .scene[data-main-rendu], #accueil .hero-still[data-main-rendu]')
          ?.getAttribute('data-main-rendu') === m,
        main,
        { timeout: 4000 }
      )
      .then(() => true)
      .catch(() => false)

  check((await sousImage.count()) === 1, `à l’accueil, le choix de la main valide (${cas})`)
  check((await pressé(sousImage, /^(Droite|Right|Derecha)$/)) === 'true', `main droite par défaut (${cas})`)

  await sousImage.getByRole('button', { name: /^(Gauche|Left|Izquierda)$/ }).tap()
  check(await rendue('left'), `choisir « gauche » redessine la main gauche (${cas})`)
  check(
    (await pressé(démo, /^(Gauche|Left|Izquierda)$/)) === 'true',
    `le choix fait à l’accueil se retrouve dans la démonstration (${cas})`
  )

  if (motion === 'reduce') {
    // Sur l'image fixe, on peut mesurer : les commandes passent à gauche.
    const côté = await page.evaluate(() => {
      const svg = document.querySelector('#accueil .hero-still')
      const cadre = svg.getBoundingClientRect()
      const centres = [...svg.querySelectorAll('rect.commande')].map((r) => {
        const b = r.getBoundingClientRect()
        return (b.left + b.right) / 2 - cadre.left
      })
      return centres.reduce((a, b) => a + b, 0) / centres.length / cadre.width
    })
    check(côté < 0.5, 'sur l’image fixe, les commandes passent du côté de la main gauche', côté.toFixed(2))
  }

  await démo.getByRole('button', { name: /^(Droite|Right|Derecha)$/ }).first().tap()
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  check(
    (await pressé(sousImage, /^(Droite|Right|Derecha)$/)) === 'true' && (await rendue('right')),
    `le choix fait dans la démonstration se retrouve à l’accueil (${cas})`
  )
  await context.close()
}

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

  const haut = page.locator('.choix-appareil')
  const démo = page.locator('#demo')
  const pressé = (portée, nom) =>
    portée.getByRole('button', { name: nom, exact: true }).getAttribute('aria-pressed')
  // L'appareil que le film dessine vraiment — pas seulement
  // celui qu'on a demandé.
  const rendu = (appareil) =>
    page
      .waitForFunction(
        (a) => document.querySelector('#ouverture .scene[data-appareil-rendu], #accueil .hero-still[data-appareil-rendu]')
          ?.getAttribute('data-appareil-rendu') === a,
        appareil,
        { timeout: 4000 }
      )
      .then(() => true)
      .catch(() => false)

  check(await haut.count() === 1, 'l’accueil propose le choix de l’appareil')
  check((await pressé(haut, 'iPad')) === 'true', 'l’iPad est le choix par défaut')
  check(await rendu('ipad'), 'le film dessine un iPad par défaut')

  await haut.getByRole('button', { name: 'iPhone', exact: true }).tap()
  check(await rendu('iphone'), 'choisir iPhone à l’accueil fait basculer le film sur un iPhone')
  check(
    (await pressé(démo, 'iPhone')) === 'true' &&
      (await démo.locator('.phone').getAttribute('data-device')) === 'iphone',
    'le choix fait en haut de page se retrouve dans la démonstration'
  )

  await démo.getByRole('button', { name: 'iPad', exact: true }).tap()
  check(
    (await pressé(haut, 'iPad')) === 'true',
    'le choix fait dans la démonstration se retrouve à l’accueil'
  )

  // Le parcours d'une vraie personne : choisir dans la démonstration, puis
  // remonter voir. Le film a redessiné l'appareil entre-temps.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  check(
    await rendu('ipad'),
    'en remontant après un choix dans la démonstration, le film a bien basculé'
  )

  // Changer d'avis au milieu de la bascule : la scène doit finir sur le
  // dernier choix, pas sur celui qu'elle était en train de dessiner.
  await haut.getByRole('button', { name: 'iPhone', exact: true }).tap()
  await page.waitForTimeout(120)
  await haut.getByRole('button', { name: 'iPad', exact: true }).tap()
  check(await rendu('ipad'), 'un changement d’avis en pleine bascule finit sur le dernier choix')

  await haut.getByRole('button', { name: 'iPhone', exact: true }).tap()
  await rendu('iphone')
  await page.reload({ waitUntil: 'networkidle' })
  check(
    (await pressé(page.locator('.choix-appareil'), 'iPhone')) === 'true' && (await rendu('iphone')),
    'le choix de l’appareil survit au rechargement'
  )

  // L'iPhone de la démonstration a maintenant un cadre et une île.
  const cadre = await page.evaluate(() => {
    const téléphone = document.querySelector('#demo .phone')
    return {
      fond: getComputedStyle(téléphone).backgroundImage,
      île: Boolean(téléphone.querySelector('.phone-island'))
    }
  })
  check(cadre.fond.includes('gradient'), 'l’iPhone de la démonstration a un cadre argenté', cadre.fond.slice(0, 60))
  check(cadre.île, 'l’iPhone de la démonstration a sa Dynamic Island')
  check(errors.length === 0, 'aucune erreur JavaScript en changeant d’appareil', errors.join(' | '))
  await context.close()
}

// Animations coupées : l'image fixe suit le choix elle aussi.
{
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce'
  })
  const page = await context.newPage()
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.locator('.choix-appareil').getByRole('button', { name: 'iPhone', exact: true }).click()
  await page.waitForTimeout(200)
  const rendu = await page.evaluate(() =>
    document.querySelector('#accueil .hero-still[data-appareil-rendu]')?.getAttribute('data-appareil-rendu')
  )
  check(rendu === 'iphone', 'animations réduites : l’image fixe passe elle aussi sur iPhone', String(rendu))
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
  await allerALaDemo(page)
  await page.waitForTimeout(400)
  await writeFile(path.join(shots, `${name}.png`), await page.screenshot())
  await context.close()
  notes.push(`  ✓ capture ${name}.png (${viewport.width}×${viewport.height})`)
}

check(violationsCSP.length === 0, 'aucune ressource refusée par la politique de sécurité (CSP)', violationsCSP.slice(0, 3).join(' | '))

await browser.close()

console.log(notes.join('\n'))
if (failures.length > 0) {
  console.error(`\n${failures.length} vérification(s) en échec :`)
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`\n${notes.length} vérifications passées.`)
