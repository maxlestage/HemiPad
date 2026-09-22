const links = [
  { href: '#demo', label: 'Démo' },
  { href: '#accessibilite', label: 'Accessibilité' },
  { href: '#clavier', label: 'Clavier' },
  { href: '#consoles', label: 'Consoles' },
  { href: '#technique', label: 'Technique' }
]

export function Nav() {
  return (
    <nav className="nav" aria-label="Navigation principale">
      <a className="nav-brand" href="#top">
        <svg viewBox="0 0 64 64" aria-hidden="true" className="nav-mark">
          <path d="M14 46a30 30 0 0 1 30-30" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.5" />
          <path d="M14 46a22 22 0 0 1 22-22" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
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
