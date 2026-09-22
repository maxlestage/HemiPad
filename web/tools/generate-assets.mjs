/*
 * Génère les images fixes du site : icônes de l'application installable et
 * fiche de partage (l'image que montrent les messageries).
 *
 * Elles sont produites une fois et versionnées — le site n'a pas à embarquer
 * un moteur de rendu pour les recalculer à chaque visite. Pour les régénérer
 * après un changement de marque :
 *
 *     npm --prefix web exec -- playwright install chromium   # si nécessaire
 *     node web/tools/generate-assets.mjs
 *
 * Le script accepte PLAYWRIGHT_EXECUTABLE pour pointer vers un Chromium déjà
 * présent sur la machine.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { chromium } from 'playwright-core'

const here = path.dirname(fileURLToPath(import.meta.url))
const publicDir = path.resolve(here, '..', 'public')

const BACKGROUND = '#05060d'
const ACCENT = '#00e5ff'
const ACCENT_2 = '#8b7dff'
const WARN = '#ffb533'

/** Le logo, à l'échelle demandée : un arc de commandes autour d'un pivot. */
function mark(scale = 1, opacity = 1) {
  return `
    <svg viewBox="0 0 64 64" style="width:${64 * scale}px;height:${64 * scale}px;opacity:${opacity}">
      <path d="M14 46a30 30 0 0 1 30-30" fill="none" stroke="${ACCENT}" stroke-width="3"
            stroke-linecap="round" opacity="0.5" />
      <path d="M14 46a22 22 0 0 1 22-22" fill="none" stroke="${ACCENT}" stroke-width="3"
            stroke-linecap="round" opacity="0.85" />
      <circle cx="44" cy="16" r="5" fill="${ACCENT}" />
      <circle cx="34" cy="21" r="4" fill="${WARN}" />
      <circle cx="26" cy="29" r="4" fill="${ACCENT}" opacity="0.7" />
      <circle cx="20" cy="38" r="3.5" fill="${ACCENT}" opacity="0.45" />
      <circle cx="14" cy="46" r="4" fill="#ffffff" opacity="0.9" />
    </svg>`
}

function iconPage(size, { safeZone = 1 } = {}) {
  // Une icône « maskable » est rognée par le système : le dessin doit tenir
  // dans un cercle central, d'où la zone de sécurité réduite.
  const scale = (size / 64) * safeZone
  return `<!doctype html><html><body style="margin:0">
    <div style="width:${size}px;height:${size}px;background:${BACKGROUND};
                display:flex;align-items:center;justify-content:center">
      <div style="display:flex">${mark(scale)}</div>
    </div>
  </body></html>`
}

function sharePage() {
  return `<!doctype html><html><body style="margin:0">
    <div style="width:1200px;height:630px;position:relative;overflow:hidden;
                background:radial-gradient(circle at 80% 90%, #131a33, ${BACKGROUND} 65%);
                font-family:'DejaVu Sans',sans-serif;color:#f2f5ff">
      <div style="position:absolute;inset:0;
                  background-image:linear-gradient(rgba(0,229,255,.07) 1px,transparent 1px),
                                   linear-gradient(90deg,rgba(0,229,255,.07) 1px,transparent 1px);
                  background-size:60px 60px"></div>
      <div style="position:absolute;right:-120px;top:-140px;width:560px;height:560px;border-radius:50%;
                  background:radial-gradient(circle, ${ACCENT_2}44, transparent 65%)"></div>

      <div style="position:relative;padding:72px 80px;display:flex;flex-direction:column;height:100%;
                  box-sizing:border-box">
        <div style="display:flex;align-items:center;gap:20px">
          ${mark(1.5)}
          <span style="font-size:44px;font-weight:700;letter-spacing:-1px">HemiPad</span>
        </div>

        <div style="margin-top:auto">
          <p style="margin:0 0 18px;font-size:22px;letter-spacing:6px;text-transform:uppercase;
                    color:${ACCENT};font-weight:600">iOS · Swift · Bluetooth HID</p>
          <h1 style="margin:0;font-size:68px;line-height:1.05;font-weight:700;max-width:16ch;
                     letter-spacing:-2px">
            La manette qui s'adapte
            <span style="background:linear-gradient(110deg, ${ACCENT}, ${ACCENT_2});
                         -webkit-background-clip:text;background-clip:text;color:transparent">
              à votre main</span>
          </h1>
          <p style="margin:26px 0 0;font-size:27px;color:#9aa3bd;max-width:30ch">
            Manette de jeu et clavier de code utilisables d'une seule main.
          </p>
        </div>

        <div style="margin-top:44px;display:flex;align-items:center;gap:18px;font-size:20px;
                    color:#9aa3bd">
          <span style="padding:10px 20px;border:1px solid rgba(255,255,255,.16);border-radius:999px">
            Conçu pour l'hémiplégie
          </span>
          <span style="padding:10px 20px;border:1px solid rgba(255,255,255,.16);border-radius:999px">
            Maxime Nathan Lestage
          </span>
        </div>
      </div>
    </div>
  </body></html>`
}

const targets = [
  { file: 'icons/icon-192.png', size: 192, html: iconPage(192) },
  { file: 'icons/icon-512.png', size: 512, html: iconPage(512) },
  { file: 'icons/maskable-192.png', size: 192, html: iconPage(192, { safeZone: 0.62 }) },
  { file: 'icons/maskable-512.png', size: 512, html: iconPage(512, { safeZone: 0.62 }) },
  { file: 'icons/apple-touch-icon.png', size: 180, html: iconPage(180, { safeZone: 0.78 }) }
]

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_EXECUTABLE || '/opt/pw-browsers/chromium'
})

await mkdir(path.join(publicDir, 'icons'), { recursive: true })

for (const target of targets) {
  const page = await browser.newPage({
    viewport: { width: target.size, height: target.size },
    deviceScaleFactor: 1
  })
  await page.setContent(target.html)
  const buffer = await page.screenshot({ omitBackground: false })
  await writeFile(path.join(publicDir, target.file), buffer)
  await page.close()
  console.log(`écrit public/${target.file} (${target.size}×${target.size})`)
}

const sharePageInstance = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1
})
await sharePageInstance.setContent(sharePage())
await writeFile(path.join(publicDir, 'partage.png'), await sharePageInstance.screenshot())
await sharePageInstance.close()
console.log('écrit public/partage.png (1200×630)')

await browser.close()
