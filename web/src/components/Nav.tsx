import { useI18n } from '../i18n/index.tsx'
import { Mark } from './Mark.tsx'

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
        <Mark className="nav-mark" compact />
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
