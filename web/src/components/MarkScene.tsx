import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'

import { shoulderIds, systemIds } from '../lib/consoles.ts'
import {
  HERO_CANVAS as CANVAS,
  avancementSurArc,
  heroLayout
} from '../lib/heroLayout.ts'
import { inclinaison } from '../lib/inclinaison.ts'
import { pointOnArc, type Placement } from '../lib/reach.ts'

/**
 * L'arc de portée, en volume.
 *
 * Un iPad posé de trois quarts, et sur son écran la disposition que le
 * solveur calcule vraiment : l'arc que le pouce atteint, et les commandes
 * posées dessus. Une lueur parcourt l'arc du pivot vers le haut et allume
 * chaque cible à son passage — c'est le geste que fait le pouce, et c'est
 * tout l'argument du produit en une image.
 *
 * Les positions ne sont pas dessinées à la main : elles sortent de
 * `solveLayout`, le même code que la démonstration et que l'application. Si
 * les règles de placement changent, cette scène change avec elles.
 */

/** Largeur de l'écran dans la scène ; tout le reste en découle. */
const ECRAN = 2.4
const UNITE = ECRAN / CANVAS.width
const BORDURE = 0.12
const EPAISSEUR = 0.16
/*
 * Le biseau déborde de l'extrusion des deux côtés : la face avant de la coque
 * ne se trouve pas à la profondeur demandée, mais un biseau plus loin. Sans en
 * tenir compte, la coque passe devant l'écran et enterre tout ce qu'on y
 * dessine — arcs, commandes et pivot compris.
 */
const BISEAU = 0.035

export interface PaletteScène {
  coque: string
  ecran: string
  accent: string
  chaud: string
  ambiance: number
}

export const PALETTES: Record<'dark' | 'light', PaletteScène> = {
  dark: { coque: '#2b3245', ecran: '#0a0e1c', accent: '#00e5ff', chaud: '#ffb533', ambiance: 0.5 },
  // Sur fond clair, la coque s'éclaircit mais l'écran reste sombre : c'est
  // l'application qui y est représentée, et elle est sombre dans les deux thèmes.
  light: { coque: '#c9d2e4', ecran: '#0b1020', accent: '#0b6f82', chaud: '#9a5b00', ambiance: 0.85 }
}

/** Du repère de la maquette (Y vers le bas) au repère de la scène. */
function versScène(x: number, y: number): [number, number] {
  return [(x - CANVAS.width / 2) * UNITE, (CANVAS.height / 2 - y) * UNITE]
}

/** Rectangle à coins arrondis, base de la coque comme de l'écran. */
function rectangleArrondi(largeur: number, hauteur: number, rayon: number): THREE.Shape {
  const forme = new THREE.Shape()
  const [dx, dy] = [largeur / 2 - rayon, hauteur / 2 - rayon]
  forme.moveTo(-largeur / 2, -dy)
  forme.absarc(-dx, -dy, rayon, Math.PI, Math.PI * 1.5, false)
  forme.absarc(dx, -dy, rayon, Math.PI * 1.5, 0, false)
  forme.absarc(dx, dy, rayon, 0, Math.PI * 0.5, false)
  forme.absarc(-dx, dy, rayon, Math.PI * 0.5, Math.PI, false)
  return forme
}

/** La coque de l'appareil : un bloc arrondi, biseauté sur ses arêtes. */
function Coque({ palette }: { palette: PaletteScène }) {
  const géométrie = useMemo(() => {
    const forme = rectangleArrondi(ECRAN + BORDURE * 2, CANVAS.height * UNITE + BORDURE * 2, 0.16)
    const bloc = new THREE.ExtrudeGeometry(forme, {
      depth: EPAISSEUR,
      bevelEnabled: true,
      bevelThickness: BISEAU,
      bevelSize: BISEAU,
      bevelSegments: 4,
      curveSegments: 24
    })
    bloc.translate(0, 0, -(EPAISSEUR + BISEAU))
    return bloc
  }, [])

  useEffect(() => () => géométrie.dispose(), [géométrie])

  return (
    <mesh geometry={géométrie}>
      <meshStandardMaterial color={palette.coque} metalness={0.75} roughness={0.35} />
    </mesh>
  )
}

/** L'écran : une dalle mate, à peine en creux dans la coque. */
function Écran({ palette }: { palette: PaletteScène }) {
  const géométrie = useMemo(
    () => new THREE.ShapeGeometry(rectangleArrondi(ECRAN, CANVAS.height * UNITE, 0.06), 24),
    []
  )
  useEffect(() => () => géométrie.dispose(), [géométrie])

  return (
    <mesh geometry={géométrie} position={[0, 0, 0.002]}>
      <meshBasicMaterial color={palette.ecran} toneMapped={false} />
    </mesh>
  )
}

/**
 * Les arcs d'atteinte, tracés en lignes fines.
 *
 * Ce sont les rayons réellement retenus par le solveur : ce que la scène
 * montre est ce que l'application calcule.
 */
function Arcs({ rayons, pivot, span, palette }: {
  rayons: number[]
  pivot: { x: number; y: number }
  span: number
  palette: PaletteScène
}) {
  const géométries = useMemo(
    () =>
      rayons.map((rayon) => {
        const points: THREE.Vector3[] = []
        for (let i = 0; i <= 48; i += 1) {
          const angle = -Math.PI / 2 - (i / 48) * span
          const point = pointOnArc(pivot, rayon, angle)
          const [x, y] = versScène(point.x, point.y)
          points.push(new THREE.Vector3(x, y, 0.004))
        }
        return new THREE.BufferGeometry().setFromPoints(points)
      }),
    [rayons, pivot, span]
  )

  useEffect(() => () => géométries.forEach((g) => g.dispose()), [géométries])

  return (
    <>
      {géométries.map((géométrie, index) => (
        <line key={index}>
          <primitive object={géométrie} attach="geometry" />
          <lineBasicMaterial
            color={palette.accent}
            transparent
            opacity={0.45 - index * 0.07}
            toneMapped={false}
          />
        </line>
      ))}
    </>
  )
}

/**
 * Les commandes, allumées au passage de la lueur.
 *
 * Chaque cible garde sa taille réelle et sa forme réelle : les quatre boutons
 * de façade sont carrés, les gâchettes plus petites, les touches système des
 * pastilles allongées. Des ronds identiques auraient été plus simples à
 * dessiner, et auraient montré autre chose que le produit.
 *
 * Chaque cible garde aussi l'angle qu'elle occupe sur son arc. La lueur balaie
 * cet angle ; une cible s'éclaire quand la lueur l'atteint, puis retombe. Rien
 * n'est scripté : c'est la géométrie du pouce qui décide de l'ordre.
 */
function Commandes({ placements, pivot, span, palette }: {
  placements: Placement[]
  pivot: { x: number; y: number }
  span: number
  palette: PaletteScène
}) {
  const groupe = useRef<THREE.Group>(null)

  const cibles = useMemo(
    () =>
      placements.map((placement) => {
        const [x, y] = versScène(placement.center.x, placement.center.y)
        const largeur = placement.size.width * UNITE
        const hauteur = placement.size.height * UNITE
        // Fraction du balayage déjà parcourue quand la lueur atteint la cible.
        const avancement = avancementSurArc(placement.center, pivot, span)
        // Les touches système sont les seules en chaud : ce sont celles qu'on
        // presse rarement, et l'œil doit pouvoir les distinguer d'un coup.
        const systeme = systemIds.includes(placement.id)
        // La croix directionnelle est posée par le solveur au pivot, sous le
        // pouce. Carrée à coins doux, elle se lit comme un pad ; ronde, elle
        // ne serait qu'un gros bouton de plus.
        const croix = placement.id === 'directional'
        const rayon = croix
          ? Math.min(largeur, hauteur) / 4
          : Math.min(largeur, hauteur) / 2
        return {
          id: placement.id,
          position: [x, y, croix ? 0.01 : 0.012] as [number, number, number],
          forme: rectangleArrondi(largeur, hauteur, rayon),
          couleur: systeme ? palette.chaud : palette.accent,
          base: croix ? 0.42 : shoulderIds.includes(placement.id) ? 0.78 : 1,
          avancement
        }
      }),
    [placements, pivot, span, palette]
  )

  const géométries = useMemo(
    () => cibles.map((cible) => new THREE.ShapeGeometry(cible.forme, 12)),
    [cibles]
  )
  useEffect(() => () => géométries.forEach((g) => g.dispose()), [géométries])

  useFrame(({ clock }) => {
    if (!groupe.current) return
    // Un aller simple de 3,2 s, puis une pause : le balayage doit se lire
    // comme un geste, pas comme un gyrophare.
    const cycle = (clock.elapsedTime % 4.4) / 3.2
    groupe.current.children.forEach((enfant, index) => {
      const cible = cibles[index]
      if (!cible) return
      const écart = Math.abs(cycle - cible.avancement)
      const intensité = Math.max(0, 1 - écart * 7)
      const matériau = (enfant as THREE.Mesh).material as THREE.MeshBasicMaterial
      matériau.opacity = cible.base * (0.55 + intensité * 0.45)
      enfant.scale.setScalar(1 + intensité * 0.14)
    })
  })

  return (
    <group ref={groupe}>
      {cibles.map((cible, index) => (
        <mesh key={cible.id} geometry={géométries[index]} position={cible.position}>
          <meshBasicMaterial
            color={cible.couleur}
            transparent
            opacity={cible.base}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  )
}

/**
 * La bande haute de l'application, réservée à l'état de la connexion.
 *
 * Deux traits suffisent à faire lire « un appareil qui fait tourner quelque
 * chose » plutôt que « une dalle noire » — et cette bande existe pour de vrai
 * dans l'application, c'est elle que le solveur garde libre.
 */
function BandeHaute({ palette }: { palette: PaletteScène }) {
  const [, yHaut] = versScène(0, 34)
  const largeurÉcran = ECRAN

  return (
    <group position={[0, yHaut, 0.008]}>
      <mesh position={[-largeurÉcran * 0.3, 0, 0]}>
        <planeGeometry args={[largeurÉcran * 0.22, 0.035]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[largeurÉcran * 0.2, 0, 0]}>
        <planeGeometry args={[largeurÉcran * 0.34, 0.022]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.18} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Le pivot du pouce : le point d'où tout part, en bas de l'écran. */
function Pivot({ pivot, palette }: { pivot: { x: number; y: number }; palette: PaletteScène }) {
  const halo = useRef<THREE.Mesh>(null)
  const [x, y] = versScène(pivot.x, pivot.y)

  useFrame(({ clock }) => {
    if (!halo.current) return
    const battement = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.12
    halo.current.scale.setScalar(battement)
  })

  return (
    <group position={[x, y, 0.008]}>
      <mesh ref={halo}>
        <circleGeometry args={[0.26, 32]} />
        <meshBasicMaterial color={palette.chaud} transparent opacity={0.16} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[0.05, 20]} />
        <meshBasicMaterial color={palette.chaud} toneMapped={false} />
      </mesh>
    </group>
  )
}

/**
 * L'appareil entier, incliné et suivant le pointeur avec inertie.
 *
 * L'inclinaison de repos est franche : un écran vu parfaitement de face n'a
 * aucune épaisseur, et c'est justement l'épaisseur qui fait l'objet.
 */
export function MarkScene({ theme }: { theme: 'dark' | 'light' }) {
  const groupe = useRef<THREE.Group>(null)
  const viewport = useThree((état) => état.viewport)
  const palette = PALETTES[theme]
  const disposition = useMemo(heroLayout, [])

  const hauteur = CANVAS.height * UNITE + BORDURE * 2
  const échelle = Math.min(viewport.width / (ECRAN + 0.6), viewport.height / hauteur) * 0.92

  useFrame(({ clock }, delta) => {
    if (!groupe.current) return
    const t = clock.elapsedTime
    // L'inclinaison vient de la souris ou du téléphone (voir
    // `lib/inclinaison.ts`). Quand le téléphone mène, on lui donne un peu plus
    // d'amplitude et on retire le balancement automatique : c'est la main qui
    // décide, et deux mouvements superposés se contrediraient.
    const téléphone = inclinaison.source === 'orientation'
    const balancement = téléphone ? 0 : 1
    const cibleY =
      -0.34 + inclinaison.x * (téléphone ? 0.42 : 0.3) + Math.sin(t * 0.33) * 0.05 * balancement
    const cibleX =
      0.16 - inclinaison.y * (téléphone ? 0.3 : 0.18) + Math.sin(t * 0.27) * 0.04 * balancement
    const amorti = 1 - Math.pow(0.0015, delta)
    groupe.current.rotation.y += (cibleY - groupe.current.rotation.y) * amorti
    groupe.current.rotation.x += (cibleX - groupe.current.rotation.x) * amorti
    groupe.current.rotation.z = Math.sin(t * 0.22) * 0.03
    groupe.current.position.y = Math.sin(t * 0.6) * 0.02 * viewport.height
  })

  return (
    <>
      <ambientLight intensity={palette.ambiance} />
      <directionalLight position={[-4, 6, 8]} intensity={2.2} color="#ffffff" />
      <directionalLight position={[6, -2, 5]} intensity={1.1} color={palette.accent} />
      <directionalLight position={[-2, -3, 9]} intensity={0.18} color={palette.chaud} />

      <group ref={groupe} scale={échelle}>
        <Coque palette={palette} />
        <Écran palette={palette} />
        <BandeHaute palette={palette} />
        <Arcs
          rayons={disposition.radii}
          pivot={disposition.pivot}
          span={disposition.span}
          palette={palette}
        />
        <Pivot pivot={disposition.pivot} palette={palette} />
        <Commandes
          placements={disposition.placements}
          pivot={disposition.pivot}
          span={disposition.span}
          palette={palette}
        />
      </group>
    </>
  )
}

export default MarkScene
