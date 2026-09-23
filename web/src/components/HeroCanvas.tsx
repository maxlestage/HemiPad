import { Canvas } from '@react-three/fiber'

import { useAppareil } from '../lib/appareil.tsx'
import { useMainValide } from '../lib/mainValide.tsx'
import { useTheme } from '../lib/theme.tsx'
import { MarkScene } from './MarkScene.tsx'

/**
 * Le canevas WebGL, isolé dans son propre fichier.
 *
 * C'est la frontière du morceau chargé à la demande : trois.js et le rendu
 * pèsent plus lourd que tout le reste du site réuni, et personne ne doit les
 * télécharger pour lire une page. Rien d'autre que ce fichier et `MarkScene`
 * n'y fait référence.
 */
export function HeroCanvas({ actif }: { actif: boolean }) {
  // Le contexte React ne traverse pas la frontière du rendu 3D : la scène a
  // son propre arbre. Le thème se lit donc ici, et descend en propriété.
  const { resolved } = useTheme()
  const { appareil } = useAppareil()
  const { main } = useMainValide()

  return (
    <Canvas
      // Coupée dès que la scène sort de l'écran ou que l'onglet passe en
      // arrière-plan : un téléphone n'a pas à calculer une image qu'on ne
      // regarde pas.
      frameloop={actif ? 'always' : 'never'}
      // Plafonner la densité de pixels change tout sur un téléphone récent :
      // au-delà, on calcule quatre fois plus de pixels pour une différence
      // que l'œil ne voit pas sur un objet qui bouge.
      dpr={[1, 1.75]}
      camera={{ position: [0, 0, 6], fov: 42 }}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ pointerEvents: 'none' }}
    >
      <MarkScene theme={resolved} appareil={appareil} main={main} />
    </Canvas>
  )
}

export default HeroCanvas
