import { useEffect, useState } from 'react'

import { useI18n } from '../i18n/index.tsx'
import { useInstallPrompt } from '../lib/pwa.ts'

/**
 * Fiche de partage : ce que la personne envoie quand elle parle du projet.
 *
 * Deux usages dans un seul bloc — le partage natif du téléphone quand il
 * existe (`navigator.share`), et une copie du lien sinon. La carte affichée
 * reprend exactement ce que verront les messageries dans leur aperçu, ce qui
 * évite la mauvaise surprise d'un lien nu.
 */
export function ShareCard() {
  const { t } = useI18n()
  const [copied, setCopied] = useState(false)
  const [canShare, setCanShare] = useState(false)
  const { canInstall, installed, install } = useInstallPrompt()

  useEffect(() => {
    setCanShare(typeof navigator !== 'undefined' && typeof navigator.share === 'function')
  }, [])

  useEffect(() => {
    if (!copied) return
    const timer = window.setTimeout(() => setCopied(false), 2400)
    return () => window.clearTimeout(timer)
  }, [copied])

  const url = typeof window === 'undefined' ? 'https://hemipad.app' : window.location.href

  const share = async () => {
    const payload = { title: 'HemiPad', text: t.share.tagline, url }
    if (canShare) {
      try {
        await navigator.share(payload)
        return
      } catch {
        // Partage refusé ou annulé : on retombe sur la copie du lien.
      }
    }
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // Presse-papiers indisponible : le lien reste visible et sélectionnable.
      setCopied(false)
    }
  }

  return (
    <section className="share" id="partage" aria-labelledby="partage-titre">
      <div className="section-head">
        <p className="eyebrow">{t.share.eyebrow}</p>
        <h2 id="partage-titre">{t.share.title}</h2>
        <p className="lede">{t.share.lede}</p>
      </div>

      <div className="share-panel">
        <article className="share-card" aria-label={t.share.cardRole}>
          <div className="share-card-visual" aria-hidden="true">
            <svg viewBox="0 0 64 64">
              <path
                d="M14 46a30 30 0 0 1 30-30"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                opacity="0.45"
              />
              <path
                d="M14 46a22 22 0 0 1 22-22"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
              <circle cx="44" cy="16" r="5" fill="currentColor" />
              <circle cx="34" cy="21" r="4" fill="currentColor" opacity="0.7" />
              <circle cx="14" cy="46" r="4" fill="currentColor" opacity="0.85" />
            </svg>
          </div>
          <div className="share-card-body">
            <p className="share-card-name">HemiPad</p>
            <p className="share-card-tagline">{t.share.tagline}</p>
            <p className="share-card-url">{url.replace(/^https?:\/\//, '')}</p>
          </div>
        </article>

        <div className="share-actions">
          <button type="button" className="button primary" onClick={share}>
            {copied ? t.share.copied : canShare ? t.share.button : t.share.copy}
          </button>

          {canInstall && !installed && (
            <button type="button" className="button ghost" onClick={install}>
              {t.install.button}
            </button>
          )}
          {installed && <span className="share-installed">{t.install.installed}</span>}
          <p className="hint share-hint">{t.install.hint}</p>
        </div>
      </div>
    </section>
  )
}
