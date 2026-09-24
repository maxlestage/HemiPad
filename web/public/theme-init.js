// Thème et langue appliqués avant le premier rendu : sans cela, une personne
// en mode clair verrait une page noire pendant un instant.
//
// Script classique et synchrone, servi par le site : la politique de sécurité
// (CSP) refuse tout script en ligne. Les valeurs lues dans le stockage local
// sont vérifiées avant d'être appliquées : une valeur inconnue est ignorée.
;(function () {
  try {
    var themes = ['auto', 'light', 'dark']
    var langues = ['fr', 'en', 'es']
    var theme = localStorage.getItem('hemipad.theme')
    if (themes.indexOf(theme) === -1) theme = 'auto'
    document.documentElement.dataset.theme = theme
    var locale = localStorage.getItem('hemipad.locale')
    if (langues.indexOf(locale) !== -1) document.documentElement.lang = locale
    var prefersLight =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches
    var dark = theme === 'dark' || (theme === 'auto' && !prefersLight)
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    var meta = document.querySelector('meta[name="theme-color"]')
    if (meta) meta.setAttribute('content', dark ? '#05060d' : '#f4f6fc')
  } catch (error) {
    // Stockage inaccessible : le thème automatique s'applique quand même.
  }
})()
