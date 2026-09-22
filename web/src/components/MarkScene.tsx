import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'

import { LEFT_BODY, RIGHT_BODY } from './Mark.tsx'

/**
 * La marque en volume : « la moitié manquante », mais en trois dimensions.
 *
 * La moitié gauche est une vraie pièce, extrudée et éclairée. La moitié droite
 * n'est qu'un nuage de points qui respire sans jamais se refermer : c'est la
 * main qui manque, et l'application qui la remplace. Rien n'est décoratif ici —
 * le volume raconte la même chose que le produit.
 *
 * Les tracés viennent de `Mark.tsx`, qui les partage déjà avec le générateur
 * d'icônes : une seule géométrie pour le logo plat, les icônes et le relief.
 */

/**
 * Le dessin vit dans le repère du SVG : 64 × 64, l'axe Y vers le bas, la
 * manette occupant x ∈ [5,5 ; 58,5] et y ∈ [20 ; 50].
 *
 * Une seule conversion pour tout le monde, appliquée aux deux moitiés et aux
 * boutons : sans elle, chaque morceau vivrait dans son propre repère et la
 * manette se disloquerait.
 */
const CENTRE_X = 32
const CENTRE_Y = 35
const LARGEUR = 53
const HAUTEUR = 30

/**
 * La scène ne peut pas lire les variables CSS : elle vit dans un autre arbre
 * React, derrière son propre rendu. La palette lui est donc passée, et elle
 * reprend exactement les couleurs du thème — un corps presque blanc sur fond
 * sombre disparaîtrait sur fond clair.
 */
export interface PaletteScène {
  corps: string
  accent: string
  chaud: string
  /** Lumière d'appoint : elle éclaire, sur fond clair elle doit se retenir. */
  ambiance: number
}

export const PALETTES: Record<'dark' | 'light', PaletteScène> = {
  dark: { corps: '#f2f5ff', accent: '#00e5ff', chaud: '#ffb533', ambiance: 0.6 },
  light: { corps: '#1c2b49', accent: '#0b6f82', chaud: '#9a5b00', ambiance: 0.85 }
}

/** Du repère SVG (Y vers le bas) au repère three (Y vers le haut), recentré. */
function versScène(x: number, y: number): [number, number] {
  return [x - CENTRE_X, CENTRE_Y - y]
}

function formesDepuis(tracé: string, règleDeRemplissage = 'nonzero'): THREE.Shape[] {
  const loader = new SVGLoader()
  const données = loader.parse(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">` +
      `<path d="${tracé}" fill-rule="${règleDeRemplissage}"/></svg>`
  )
  return données.paths.flatMap((chemin) => SVGLoader.createShapes(chemin))
}

/** La moitié pleine : la main qui répond. */
function CorpsGauche({ palette }: { palette: PaletteScène }) {
  const géométrie = useMemo(() => {
    const formes = formesDepuis(LEFT_BODY, 'evenodd')
    const extrudée = new THREE.ExtrudeGeometry(formes, {
      depth: 7,
      bevelEnabled: true,
      bevelThickness: 1.1,
      bevelSize: 0.9,
      bevelSegments: 3,
      curveSegments: 18
    })
    // Miroir vertical puis translation : exactement `versScène`, appliqué
    // d'un coup à tous les sommets. La profondeur est recentrée pour que la
    // pièce tourne autour de son milieu et non de sa face arrière.
    extrudée.scale(1, -1, 1)
    extrudée.translate(-CENTRE_X, CENTRE_Y, -3.5)
    extrudée.computeVertexNormals()
    return extrudée
  }, [])

  useEffect(() => () => géométrie.dispose(), [géométrie])

  return (
    <mesh geometry={géométrie}>
      <meshStandardMaterial color={palette.corps} metalness={0.2} roughness={0.34} />
    </mesh>
  )
}

/**
 * La moitié absente, échantillonnée en points le long de son contour.
 *
 * Chaque point s'écarte puis revient, avec un décalage qui dépend de sa
 * hauteur : l'onde parcourt le contour au lieu de le faire pulser d'un bloc.
 */
function MoitiéManquante({ palette, taille }: { palette: PaletteScène; taille: number }) {
  const { géométrie, repos, directions } = useMemo(() => {
    const sommets: number[] = []
    for (const forme of formesDepuis(RIGHT_BODY)) {
      // Échantillonnage régulier : suivre la courbe au millimètre près
      // entasserait les points dans les angles et en laisserait manquer ailleurs.
      for (const point of forme.getSpacedPoints(280)) {
        const [x, y] = versScène(point.x, point.y)
        sommets.push(x, y, 0)
      }
    }

    const repos = new Float32Array(sommets)
    // Une épaisseur en profondeur, sinon le nuage n'est qu'un rideau plat.
    for (let i = 2; i < repos.length; i += 3) {
      repos[i] = Math.sin(i * 0.23) * 1.8
    }

    // Les points s'écartent du centre de *leur* moitié : autour de ce centre,
    // le contour s'ouvre comme une main, au lieu de fuir la moitié pleine.
    //
    // Les `!` de cette fonction et de la boucle d'animation portent sur des
    // indices calculés à partir de la longueur du tableau lui-même, par pas de
    // trois : ils sont toujours dans les bornes. Les vérifier à chaque image,
    // sur plusieurs centaines de points, coûterait plus cher que tout le reste.
    let sommeX = 0
    for (let i = 0; i < repos.length; i += 3) sommeX += repos[i]!
    const centreX = sommeX / (repos.length / 3)

    const directions = new Float32Array(repos.length)
    const écart = new THREE.Vector2()
    for (let i = 0; i < repos.length; i += 3) {
      écart.set(repos[i]! - centreX, repos[i + 1]!).normalize()
      directions[i] = écart.x
      directions[i + 1] = écart.y
    }

    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(repos.slice(), 3))
    return { géométrie: g, repos, directions }
  }, [])

  useEffect(() => () => géométrie.dispose(), [géométrie])

  useFrame(({ clock }) => {
    const attribut = géométrie.getAttribute('position') as THREE.BufferAttribute
    const tableau = attribut.array as Float32Array
    const temps = clock.elapsedTime
    for (let i = 0; i < tableau.length; i += 3) {
      const souffle = 0.9 + Math.sin(temps * 0.75 + repos[i + 1]! * 0.14) * 0.9
      tableau[i] = repos[i]! + directions[i]! * souffle
      tableau[i + 1] = repos[i + 1]! + directions[i + 1]! * souffle
      tableau[i + 2] = repos[i + 2]! + Math.sin(temps * 0.5 + i * 0.05) * 0.3
    }
    attribut.needsUpdate = true
  })

  return (
    <points geometry={géométrie}>
      {/*
        La taille d'un point est exprimée en unités du monde et ignore
        l'échelle du groupe : réglée en dur, elle donnait un gros boudin
        continu au lieu d'un pointillé. Elle suit donc l'échelle calculée.
      */}
      <pointsMaterial
        color={palette.accent}
        size={taille}
        sizeAttenuation
        transparent
        opacity={0.92}
        depthWrite={false}
      />
    </points>
  )
}

/**
 * Les deux boutons de la moitié absente.
 *
 * Seuls objets pleins de ce côté, aux coordonnées exactes du logo plat : ce
 * sont les commandes que la main manquante ne peut pas atteindre.
 */
function Boutons({ palette }: { palette: PaletteScène }) {
  const groupe = useRef<THREE.Group>(null)
  const [cyanX, cyanY] = versScène(44.5, 29.5)
  const [ambreX, ambreY] = versScène(50.5, 35.5)

  useFrame(({ clock }) => {
    if (!groupe.current) return
    groupe.current.position.z = Math.sin(clock.elapsedTime * 1.1) * 1.4
  })

  return (
    <group ref={groupe}>
      <mesh position={[cyanX, cyanY, 2]}>
        <sphereGeometry args={[3.4, 24, 24]} />
        <meshStandardMaterial
          color={palette.accent}
          emissive={palette.accent}
          emissiveIntensity={0.6}
          roughness={0.25}
        />
      </mesh>
      <mesh position={[ambreX, ambreY, 2]}>
        <sphereGeometry args={[3.4, 24, 24]} />
        <meshStandardMaterial
          color={palette.chaud}
          emissive={palette.chaud}
          emissiveIntensity={0.55}
          roughness={0.25}
        />
      </mesh>
    </group>
  )
}

/**
 * L'ensemble, suivant le pointeur avec inertie.
 *
 * Le suivi est volontairement mou et borné à une quinzaine de degrés : une
 * scène qui colle au doigt donne le tournis, et le but reste de montrer un
 * objet, pas de jouer avec.
 *
 * L'éclairage n'emploie que des lumières directionnelles : leur intensité ne
 * dépend pas de la distance, donc du modèle d'éclairage retenu par la version
 * de three installée. Une lumière ponctuelle bien réglée aujourd'hui devient
 * un aplat blanc ou un trou noir à la prochaine mise à jour.
 */
export function MarkScene({ theme }: { theme: 'dark' | 'light' }) {
  const groupe = useRef<THREE.Group>(null)
  const viewport = useThree((état) => état.viewport)
  const palette = PALETTES[theme]

  // La marque occupe la même part de la zone quelle que soit la taille de
  // l'écran : on la fait tenir dans le cadre, avec une marge d'un dixième.
  const échelle = Math.min(viewport.width / LARGEUR, viewport.height / HAUTEUR) * 0.9

  useFrame(({ clock, pointer }, delta) => {
    if (!groupe.current) return
    const cibleY = pointer.x * 0.26 + Math.sin(clock.elapsedTime * 0.35) * 0.12
    const cibleX = -pointer.y * 0.16 + Math.sin(clock.elapsedTime * 0.27) * 0.05
    // Amortissement indépendant du nombre d'images par seconde : sur un écran
    // à 120 Hz, un facteur fixe rendrait le suivi deux fois plus nerveux.
    const amorti = 1 - Math.pow(0.0015, delta)
    groupe.current.rotation.y += (cibleY - groupe.current.rotation.y) * amorti
    groupe.current.rotation.x += (cibleX - groupe.current.rotation.x) * amorti
    groupe.current.position.y = Math.sin(clock.elapsedTime * 0.7) * 0.02 * viewport.height
  })

  return (
    <>
      <ambientLight intensity={palette.ambiance} />
      <directionalLight position={[-6, 8, 12]} intensity={2.9} color="#ffffff" />
      <directionalLight position={[-9, -4, 6]} intensity={1.6} color={palette.accent} />
      <directionalLight position={[8, 5, 7]} intensity={1.2} color={palette.chaud} />

      <group ref={groupe} scale={échelle}>
        <CorpsGauche palette={palette} />
        <MoitiéManquante palette={palette} taille={échelle * 1.15} />
        <Boutons palette={palette} />
      </group>
    </>
  )
}

export default MarkScene
