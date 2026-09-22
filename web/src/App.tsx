import { Architecture } from './components/Architecture.tsx'
import { ConsoleShowcase } from './components/ConsoleShowcase.tsx'
import { FeatureGrid } from './components/FeatureGrid.tsx'
import { Footer } from './components/Footer.tsx'
import { Hero } from './components/Hero.tsx'
import { KeyboardDemo } from './components/KeyboardDemo.tsx'
import { Nav } from './components/Nav.tsx'
import { ReachDemo } from './components/ReachDemo.tsx'

export function App() {
  return (
    <div className="page" id="top">
      <a className="skip-link" href="#demo">
        Aller à la démonstration
      </a>
      <Nav />
      <Hero />
      <main>
        <ReachDemo />
        <FeatureGrid />
        <KeyboardDemo />
        <ConsoleShowcase />
        <Architecture />
      </main>
      <Footer />
    </div>
  )
}
