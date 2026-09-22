import { useI18n, type Locale } from '../i18n/index.tsx'
import { motionChoices, useMotion, type MotionChoice } from '../lib/motion.tsx'
import { Mark } from './Mark.tsx'
import { themeChoices, useTheme, type ThemeChoice } from '../lib/theme.tsx'

/**
 * Pied de page.
 *
 * Il porte les trois choses qu'on cherche en bas d'un site sérieux : qui a
 * fait le produit, sous quelles conditions on peut s'en servir, et comment
 * l'adapter à soi — langue et thème. Les deux sélecteurs sont ici, et pas
 * cachés derrière une icône : un réglage qu'on ne trouve pas n'existe pas.
 */
export function Footer() {
  const { t, locale, setLocale, available } = useI18n()
  const { choice, setChoice } = useTheme()
  const { choice: motion, setChoice: setMotion } = useMotion()
  const year = new Date().getFullYear()

  const themeLabels: Record<ThemeChoice, string> = {
    auto: t.footer.themes.auto,
    light: t.footer.themes.light,
    dark: t.footer.themes.dark
  }

  const motionLabels: Record<MotionChoice, string> = {
    auto: t.footer.motions.auto,
    full: t.footer.motions.full,
    reduced: t.footer.motions.reduced
  }

  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <a className="footer-mark" href="#top" aria-label="HemiPad">
            <Mark compact />
            <span>HemiPad</span>
          </a>
          <p className="footer-tagline">{t.footer.tagline}</p>
          <p className="footer-body">{t.footer.body}</p>
        </div>

        <nav className="footer-links" aria-label={t.nav.label}>
          {t.footer.sections.map((section) => (
            <div key={section.title}>
              <h2>{section.title}</h2>
              <ul>
                {section.links.map((link) => (
                  <li key={link.href}>
                    <a href={link.href}>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="footer-credits">
            <h2>{t.footer.creditsTitle}</h2>
            <p className="footer-author">{t.footer.author}</p>
            <p className="footer-role">{t.footer.creditsRole}</p>
          </div>
        </nav>

        <div className="footer-preferences">
          <fieldset className="preference preference-langue">
            <legend>{t.footer.languageTitle}</legend>
            <div className="segmented segmented-compact">
              {available.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  lang={item.code}
                  className={locale === item.code ? 'is-active' : ''}
                  aria-pressed={locale === item.code}
                  aria-label={`${t.localeSwitchLabel} : ${item.name}`}
                  onClick={() => setLocale(item.code as Locale)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="preference preference-theme">
            <legend>{t.footer.themeTitle}</legend>
            <div className="segmented segmented-compact">
              {themeChoices.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={choice === item ? 'is-active' : ''}
                  aria-pressed={choice === item}
                  onClick={() => setChoice(item)}
                >
                  {themeLabels[item]}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="preference preference-animation">
            <legend>{t.footer.motionTitle}</legend>
            <div className="segmented segmented-compact">
              {motionChoices.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={motion === item ? 'is-active' : ''}
                  aria-pressed={motion === item}
                  onClick={() => setMotion(item)}
                >
                  {motionLabels[item]}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </div>

      <div className="footer-legal">
        <p className="footer-copyright">
          © {year} {t.footer.author}. {t.footer.rights}
        </p>
        <p>{t.footer.proprietary}</p>
        <p className="footer-trademarks">{t.footer.trademarks}</p>
      </div>
    </footer>
  )
}
