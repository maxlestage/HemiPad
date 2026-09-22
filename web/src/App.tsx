import { Architecture } from './components/Architecture.tsx'
import { ConsoleShowcase } from './components/ConsoleShowcase.tsx'
import { FeatureGrid } from './components/FeatureGrid.tsx'
import { Footer } from './components/Footer.tsx'
import { Hero } from './components/Hero.tsx'
import { KeyboardDemo } from './components/KeyboardDemo.tsx'
import { Nav } from './components/Nav.tsx'
import { ReachDemo } from './components/ReachDemo.tsx'
import { ShareCard } from './components/ShareCard.tsx'
import { useI18n } from './i18n/index.tsx'
import { useScrollReveal } from './lib/useScrollReveal.ts'

export function App() {
  const { t } = useI18n()
  useScrollReveal()

  return (
    <div className="page" id="top">
      <a className="skip-link" href="#demo">
        {t.nav.skip}
      </a>
      <Nav />
      <Hero />
      <main>
        <ReachDemo />
        <FeatureGrid />
        <KeyboardDemo />
        <ConsoleShowcase />
        <Architecture />
        <ShareCard />
      </main>
      <Footer />
    </div>
  )
}
