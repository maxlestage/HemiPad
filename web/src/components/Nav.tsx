import { useI18n } from '../i18n/index.tsx'

export function Nav() {
  const { t } = useI18n()

  const links = [
    { href: '#demo', label: t.nav.demo },
    { href: '#accessibilite', label: t.nav.accessibility },
    { href: '#clavier', label: t.nav.keyboard },
    { href: '#consoles', label: t.nav.consoles },
    { href: '#technique', label: t.nav.tech }
  ]

  return (
    <nav className="nav" aria-label={t.nav.label}>
      <a className="nav-brand" href="#top">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="nav-mark">
          <path
            d="M14 46a30 30 0 0 1 30-30"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
            opacity="0.5"
          />
          <path
            d="M14 46a22 22 0 0 1 22-22"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx="44" cy="16" r="5" fill="currentColor" />
          <circle cx="14" cy="46" r="4" fill="currentColor" opacity="0.8" />
        </svg>
        <span>HemiPad</span>
      </a>
      <ul className="nav-links">
        {links.map((link) => (
          <li key={link.href}>
            <a href={link.href}>{link.label}</a>
          </li>
        ))}
      </ul>
    </nav>
  )
}
