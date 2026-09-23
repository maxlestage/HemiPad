import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'

import type { Appareil } from '../lib/appareils.ts'
import { shoulderIds, systemIds } from '../lib/consoles.ts'
import { HERO_APPAREILS, avancementSurArc, heroLayout } from '../lib/heroLayout.ts'
import { inclinaison } from '../lib/inclinaison.ts'
import { pointOnArc, type Placement } from '../lib/reach.ts'

/**
 * L'arc de portée, en volume.
 *
 * Un iPad — ou un iPhone, selon le choix de la personne — posé de trois
 * quarts, et sur son écran la disposition que le solveur calcule vraiment :
 * l'arc que le pouce atteint, et les commandes posées dessus. Une lueur
 * parcourt l'arc du pivot vers le haut et allume chaque cible à son passage.
 *
 * Les positions ne sont pas dessinées à la main : elles sortent de
 * `solveLayout`, le même code que la démonstration et que l'application.
 */

/**
 * La silhouette de chaque appareil.
 *
 * L'iPhone se reconnaît à trois choses : sa hauteur, ses coins très arrondis
 * et la Dynamic Island. L'iPad, à ses bords réguliers et ses coins plus
 * francs. Les deux écrans ont presque la même hauteur dans la scène : passer
 * de l'un à l'autre ne fait pas sauter la taille de l'image.
 */
interface Gabarit {
  largeurÉcran: number
  bordure: number
  rayonCoque: number
  rayonÉcran: number
  épaisseur: number
  /** Hauteur, dans le repère de la maquette, des deux traits d'état. */
  yBande: number
  île: boolean
}

const GABARITS: Record<Appareil, Gabarit> = {
  ipad: {
    largeurÉcran: 2.4,
    bordure: 0.12,
    rayonCoque: 0.16,
    rayonÉcran: 0.06,
    épaisseur: 0.16,
    yBande: 34,
    île: false
  },
  iphone: {
    largeurÉcran: 1.5,
    bordure: 0.065,
    rayonCoque: 0.27,
    rayonÉcran: 0.21,
    épaisseur: 0.13,
    // Sous la Dynamic Island, pas à sa hauteur.
    yBande: 92,
    île: true
  }
}

/*
 * Le biseau déborde de l'extrusion des deux côtés : la face avant de la coque
 * ne se trouve pas à la profondeur demandée, mais un biseau plus loin. Sans en
 * tenir compte, la coque passe devant l'écran et enterre tout ce qu'on y
 * dessine — arcs, commandes et pivot compris.
 */
const BISEAU = 0.035

/** Durée de chaque moitié de la bascule d'un appareil à l'autre. */
const DEMI_BASCULE = 0.26

export interface PaletteScène {
  coque: string
  ecran: string
  accent: string
  chaud: string
  ambiance: number
}

/*
 * La coque est argentée dans les deux thèmes. Elle était gris ardoise en
 * sombre — et, métallique sans rien à refléter, elle rendait presque noir :
 * une dalle sombre sur fond sombre. L'argent apporte la lumière de la page.
 */
export const PALETTES: Record<'dark' | 'light', PaletteScène> = {
  dark: { coque: '#e4e8ee', ecran: '#0a0e1c', accent: '#00e5ff', chaud: '#ffb533', ambiance: 0.35 },
  // Un argent un peu plus soutenu sur fond clair, pour que la silhouette se
  // détache. L'écran reste sombre : c'est l'application qui y est
  // représentée, et elle est sombre dans les deux thèmes.
  light: { coque: '#c7ced9', ecran: '#0b1020', accent: '#0b6f82', chaud: '#9a5b00', ambiance: 0.55 }
}

/** Les mesures dérivées d'un appareil : unité, hauteur, conversion. */
function mesures(appareil: Appareil) {
  const gabarit = GABARITS[appareil]
  const { canvas } = HERO_APPAREILS[appareil]
  const unité = gabarit.largeurÉcran / canvas.width
  const hauteurÉcran = canvas.height * unité
  /** Du repère de la maquette (Y vers le bas) au repère de la scène. */
  const versScène = (x: number, y: number): [number, number] => [
    (x - canvas.width / 2) * unité,
    (canvas.height / 2 - y) * unité
  ]
  return { gabarit, canvas, unité, hauteurÉcran, versScène }
}

type Mesures = ReturnType<typeof mesures>

/**
 * La tache d'ombre douce posée sous chaque commande.
 *
 * Un dégradé radial peint une fois dans un petit canevas, puis partagé par
 * toutes les commandes. L'écran est sombre : une ombre noire n'y laisserait
 * aucune trace, c'est donc la couleur de la commande qui se diffuse sous elle.
 */
let texturePartagée: THREE.CanvasTexture | null = null

function textureOmbre(): THREE.CanvasTexture {
  if (texturePartagée) return texturePartagée
  const taille = 64
  const canevas = document.createElement('canvas')
  canevas.width = taille
  canevas.height = taille
  const contexte = canevas.getContext('2d')!
  const dégradé = contexte.createRadialGradient(
    taille / 2, taille / 2, 0,
    taille / 2, taille / 2, taille / 2
  )
  dégradé.addColorStop(0, 'rgba(255,255,255,1)')
  dégradé.addColorStop(0.45, 'rgba(255,255,255,0.45)')
  dégradé.addColorStop(1, 'rgba(255,255,255,0)')
  contexte.fillStyle = dégradé
  contexte.fillRect(0, 0, taille, taille)
  texturePartagée = new THREE.CanvasTexture(canevas)
  return texturePartagée
}

/** Rectangle à coins arrondis, base de la coque, de l'écran et de l'île. */
function rectangleArrondi(largeur: number, hauteur: number, rayon: number): THREE.Shape {
  const forme = new THREE.Shape()
  const r = Math.min(rayon, largeur / 2, hauteur / 2)
  const [dx, dy] = [largeur / 2 - r, hauteur / 2 - r]
  forme.moveTo(-largeur / 2, -dy)
  forme.absarc(-dx, -dy, r, Math.PI, Math.PI * 1.5, false)
  forme.absarc(dx, -dy, r, Math.PI * 1.5, 0, false)
  forme.absarc(dx, dy, r, 0, Math.PI * 0.5, false)
  forme.absarc(-dx, dy, r, Math.PI * 0.5, Math.PI, false)
  return forme
}

/**
 * Un éclairage de studio, pour que le métal ait quelque chose à refléter.
 *
 * Généré sur place (`RoomEnvironment`) plutôt que chargé depuis une image : pas
 * de fichier de plusieurs mégaoctets à télécharger, et le même rendu hors
 * connexion. C'est lui qui fait briller l'argent le long des arêtes.
 */
function Environnement() {
  const { gl, scene } = useThree()

  useEffect(() => {
    const générateur = new THREE.PMREMGenerator(gl)
    const salle = new RoomEnvironment()
    const texture = générateur.fromScene(salle, 0.04).texture
    scene.environment = texture
    scene.environmentIntensity = 0.9
    return () => {
      scene.environment = null
      texture.dispose()
      générateur.dispose()
      salle.dispose()
    }
  }, [gl, scene])

  return null
}

/** La coque : un bloc arrondi, biseauté sur ses arêtes, en aluminium. */
function Coque({ m, palette }: { m: Mesures; palette: PaletteScène }) {
  const { gabarit, hauteurÉcran } = m
  const géométrie = useMemo(() => {
    const forme = rectangleArrondi(
      gabarit.largeurÉcran + gabarit.bordure * 2,
      hauteurÉcran + gabarit.bordure * 2,
      gabarit.rayonCoque
    )
    const bloc = new THREE.ExtrudeGeometry(forme, {
      depth: gabarit.épaisseur,
      bevelEnabled: true,
      bevelThickness: BISEAU,
      bevelSize: BISEAU,
      bevelSegments: 5,
      curveSegments: 32
    })
    bloc.translate(0, 0, -(gabarit.épaisseur + BISEAU))
    return bloc
  }, [gabarit, hauteurÉcran])

  useEffect(() => () => géométrie.dispose(), [géométrie])

  return (
    <mesh geometry={géométrie}>
      <meshStandardMaterial color={palette.coque} metalness={0.92} roughness={0.26} />
    </mesh>
  )
}

/** L'écran : une dalle mate, à peine en creux dans la coque. */
function Écran({ m, palette }: { m: Mesures; palette: PaletteScène }) {
  const { gabarit, hauteurÉcran } = m
  const géométrie = useMemo(
    () =>
      new THREE.ShapeGeometry(
        rectangleArrondi(gabarit.largeurÉcran, hauteurÉcran, gabarit.rayonÉcran),
        32
      ),
    [gabarit, hauteurÉcran]
  )
  useEffect(() => () => géométrie.dispose(), [géométrie])

  return (
    <mesh geometry={géométrie} position={[0, 0, 0.002]}>
      <meshBasicMaterial color={palette.ecran} toneMapped={false} />
    </mesh>
  )
}

/** La Dynamic Island : la pilule noire qui fait reconnaître un iPhone. */
function Île({ m }: { m: Mesures }) {
  const { gabarit, hauteurÉcran } = m
  const largeur = gabarit.largeurÉcran * 0.3
  const hauteur = largeur * 0.3
  const géométrie = useMemo(
    () => new THREE.ShapeGeometry(rectangleArrondi(largeur, hauteur, hauteur / 2), 24),
    [largeur, hauteur]
  )
  useEffect(() => () => géométrie.dispose(), [géométrie])

  return (
    <mesh geometry={géométrie} position={[0, hauteurÉcran / 2 - hauteur * 1.35, 0.01]}>
      <meshBasicMaterial color="#000000" toneMapped={false} />
    </mesh>
  )
}

/**
 * Les arcs d'atteinte, tracés en lignes fines.
 *
 * Ce sont les rayons réellement retenus par le solveur : ce que la scène
 * montre est ce que l'application calcule.
 */
function Arcs({ m, rayons, pivot, span, palette }: {
  m: Mesures
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
          const [x, y] = m.versScène(point.x, point.y)
          points.push(new THREE.Vector3(x, y, 0.004))
        }
        return new THREE.BufferGeometry().setFromPoints(points)
      }),
    [m, rayons, pivot, span]
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
 * de façade sont ronds, les gâchettes plus petites, les touches système des
 * pastilles allongées. Chaque cible garde aussi l'angle qu'elle occupe sur son
 * arc : la lueur balaie cet angle, et c'est la géométrie du pouce qui décide
 * de l'ordre.
 */
function Commandes({ m, placements, pivot, span, palette }: {
  m: Mesures
  placements: Placement[]
  pivot: { x: number; y: number }
  span: number
  palette: PaletteScène
}) {
  const groupe = useRef<THREE.Group>(null)
  const ombres = useRef<THREE.Group>(null)
  const texture = useMemo(textureOmbre, [])

  const cibles = useMemo(
    () =>
      placements.map((placement) => {
        const [x, y] = m.versScène(placement.center.x, placement.center.y)
        const largeur = placement.size.width * m.unité
        const hauteur = placement.size.height * m.unité
        const avancement = avancementSurArc(placement.center, pivot, span)
        // Les touches système sont les seules en chaud : ce sont celles qu'on
        // presse rarement, et l'œil doit pouvoir les distinguer d'un coup.
        const systeme = systemIds.includes(placement.id)
        // Le stick et la croix directionnelle, posés par le solveur au plus
        // près du pouce, restent en retrait : ce sont des zones, pas des
        // boutons. La croix, carrée à coins doux, se lit comme un pad.
        const croix = placement.id === 'dpad'
        const zone = croix || placement.id === 'directional'
        const rayon = croix ? Math.min(largeur, hauteur) / 4 : Math.min(largeur, hauteur) / 2
        return {
          id: placement.id,
          position: [x, y, zone ? 0.01 : 0.012] as [number, number, number],
          // L'ombre tombe un peu vers le bas, comme sous une lumière venue
          // d'en haut, et déborde de la commande de chaque côté.
          ombre: {
            position: [x, y - hauteur * 0.14, 0.0085] as [number, number, number],
            échelle: [largeur * 1.9, hauteur * 1.9] as [number, number]
          },
          forme: rectangleArrondi(largeur, hauteur, rayon),
          couleur: systeme ? palette.chaud : palette.accent,
          base: zone ? 0.42 : shoulderIds.includes(placement.id) ? 0.78 : 1,
          avancement
        }
      }),
    [m, placements, pivot, span, palette]
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

      // L'ombre suit la commande : plus dense et plus large quand la lueur
      // la touche, comme si elle se soulevait un instant.
      const ombre = ombres.current?.children[index]
      if (ombre) {
        const matériauOmbre = (ombre as THREE.Mesh).material as THREE.MeshBasicMaterial
        matériauOmbre.opacity = cible.base * (0.32 + intensité * 0.3)
        const [l, h] = cible.ombre.échelle
        const gonflement = 1 + intensité * 0.18
        ombre.scale.set(l * gonflement, h * gonflement, 1)
      }
    })
  })

  return (
    <>
      <group ref={ombres}>
        {cibles.map((cible) => (
          <mesh
            key={cible.id}
            position={cible.ombre.position}
            scale={[cible.ombre.échelle[0], cible.ombre.échelle[1], 1]}
          >
            <planeGeometry args={[1, 1]} />
            <meshBasicMaterial
              map={texture}
              color={cible.couleur}
              transparent
              opacity={cible.base * 0.32}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
      </group>
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
    </>
  )
}

/**
 * La bande haute de l'application, réservée à l'état de la connexion.
 *
 * Deux traits suffisent à faire lire « un appareil qui fait tourner quelque
 * chose » plutôt que « une dalle noire » — et cette bande existe pour de vrai
 * dans l'application, c'est elle que le solveur garde libre.
 */
function BandeHaute({ m, palette }: { m: Mesures; palette: PaletteScène }) {
  const [, yHaut] = m.versScène(0, m.gabarit.yBande)
  const largeurÉcran = m.gabarit.largeurÉcran

  return (
    <group position={[0, yHaut, 0.008]}>
      <mesh position={[-largeurÉcran * 0.28, 0, 0]}>
        <planeGeometry args={[largeurÉcran * 0.24, 0.035]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.6} toneMapped={false} />
      </mesh>
      <mesh position={[largeurÉcran * 0.18, 0, 0]}>
        <planeGeometry args={[largeurÉcran * 0.36, 0.022]} />
        <meshBasicMaterial color={palette.accent} transparent opacity={0.18} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** Le pivot du pouce : le point d'où tout part, en bas de l'écran. */
function Pivot({ m, pivot, palette }: {
  m: Mesures
  pivot: { x: number; y: number }
  palette: PaletteScène
}) {
  const halo = useRef<THREE.Mesh>(null)
  const [x, y] = m.versScène(pivot.x, pivot.y)
  const rayon = m.gabarit.largeurÉcran * 0.11

  useFrame(({ clock }) => {
    if (!halo.current) return
    const battement = 1 + Math.sin(clock.elapsedTime * 1.6) * 0.12
    halo.current.scale.setScalar(battement)
  })

  return (
    <group position={[x, y, 0.008]}>
      <mesh ref={halo}>
        <circleGeometry args={[rayon, 32]} />
        <meshBasicMaterial color={palette.chaud} transparent opacity={0.16} toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[rayon * 0.2, 20]} />
        <meshBasicMaterial color={palette.chaud} toneMapped={false} />
      </mesh>
    </group>
  )
}

/** L'appareil complet : coque, écran, et tout ce que l'écran affiche. */
function Appareil3D({ appareil, palette }: { appareil: Appareil; palette: PaletteScène }) {
  const m = useMemo(() => mesures(appareil), [appareil])
  const disposition = useMemo(() => heroLayout(appareil), [appareil])

  return (
    <>
      <Coque m={m} palette={palette} />
      <Écran m={m} palette={palette} />
      {m.gabarit.île && <Île m={m} />}
      <BandeHaute m={m} palette={palette} />
      <Arcs
        m={m}
        rayons={disposition.radii}
        pivot={disposition.pivot}
        span={disposition.span}
        palette={palette}
      />
      <Pivot m={m} pivot={disposition.pivot} palette={palette} />
      <Commandes
        m={m}
        placements={disposition.placements}
        pivot={disposition.pivot}
        span={disposition.span}
        palette={palette}
      />
    </>
  )
}

/**
 * L'appareil, incliné, suivant le pointeur ou le téléphone avec inertie — et
 * pivotant sur lui-même quand on change d'appareil.
 *
 * La bascule se fait en deux moitiés : l'appareil tourne jusqu'à se présenter
 * par la tranche, change de silhouette à ce moment-là, où l'on n'en voit
 * presque rien, puis revient de face. Un simple remplacement ferait sauter
 * l'image ; un fondu montrerait deux appareils superposés.
 */
export function MarkScene({ theme, appareil }: { theme: 'dark' | 'light'; appareil: Appareil }) {
  const inclinaisonGroupe = useRef<THREE.Group>(null)
  const basculeGroupe = useRef<THREE.Group>(null)
  const viewport = useThree((état) => état.viewport)
  const palette = PALETTES[theme]

  const [affiché, setAffiché] = useState<Appareil>(appareil)
  const demandé = useRef(appareil)
  const rendu = useRef(affiché)
  /*
   * La bascule avance par le temps écoulé entre deux images, pas par l'horloge
   * de la scène : R3F remet cette horloge à zéro chaque fois que la boucle
   * reprend — quand l'appareil revient à l'écran. Une bascule datée par
   * l'horloge et commencée juste avant la pause attendait alors que l'horloge
   * retrouve son ancienne valeur : autant de secondes que la page était restée
   * ouverte. On choisissait « iPhone » dans la démonstration, on remontait, et
   * le haut de page montrait toujours l'iPad.
   */
  const bascule = useRef<{ écoulé: number; phase: 'aller' | 'retour' } | null>(null)
  demandé.current = appareil
  rendu.current = affiché

  // Témoin pour les vérifications : l'appareil que la scène dessine vraiment,
  // une fois la bascule faite — pas seulement celui qu'on a demandé.
  useEffect(() => {
    document.querySelector('.hero-scene')?.setAttribute('data-appareil-rendu', affiché)
  }, [affiché])

  const m = mesures(affiché)
  const hauteurTotale = m.hauteurÉcran + m.gabarit.bordure * 2
  const largeurTotale = m.gabarit.largeurÉcran + m.gabarit.bordure * 2
  // L'appareil tient dans le cadre avec une marge franche : incliné, son bord
  // le plus proche grossit par la perspective, et il flotte légèrement. À
  // 0,92 il frôlait le haut de sa zone. Les deux silhouettes ont presque la
  // même hauteur : l'échelle ne saute pas à la bascule.
  const échelle =
    Math.min(viewport.width / (largeurTotale + 0.6), viewport.height / hauteurTotale) * 0.82

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime

    // --- Bascule d'un appareil à l'autre --------------------------------
    if (!bascule.current && demandé.current !== rendu.current) {
      bascule.current = { écoulé: 0, phase: 'aller' }
    }
    let angle = 0
    const b = bascule.current
    if (b) {
      // Un écart borné : après une longue pause, la première image ne doit pas
      // faire sauter la bascule d'un coup jusqu'au bout.
      b.écoulé += Math.min(delta, 0.1)
      const p = Math.min(1, b.écoulé / DEMI_BASCULE)
      const lissé = p * p * (3 - 2 * p)
      if (b.phase === 'aller') {
        angle = lissé * (Math.PI / 2)
        if (p >= 1) {
          // Par la tranche : on change de silhouette maintenant. On prend la
          // dernière demande, même si elle a changé en cours de route.
          setAffiché(demandé.current)
          rendu.current = demandé.current
          bascule.current = { écoulé: 0, phase: 'retour' }
          angle = Math.PI / 2
        }
      } else {
        angle = -(1 - lissé) * (Math.PI / 2)
        if (p >= 1) {
          angle = 0
          bascule.current = null
        }
      }
    }
    if (basculeGroupe.current) basculeGroupe.current.rotation.y = angle

    // --- Inclinaison (souris ou téléphone) -----------------------------
    if (!inclinaisonGroupe.current) return
    const téléphone = inclinaison.source === 'orientation'
    const balancement = téléphone ? 0 : 1
    const cibleY =
      -0.34 + inclinaison.x * (téléphone ? 0.42 : 0.3) + Math.sin(t * 0.33) * 0.05 * balancement
    const cibleX =
      0.16 - inclinaison.y * (téléphone ? 0.3 : 0.18) + Math.sin(t * 0.27) * 0.04 * balancement
    const amorti = 1 - Math.pow(0.0015, delta)
    const g = inclinaisonGroupe.current
    g.rotation.y += (cibleY - g.rotation.y) * amorti
    g.rotation.x += (cibleX - g.rotation.x) * amorti
    g.rotation.z = Math.sin(t * 0.22) * 0.03
    g.position.y = Math.sin(t * 0.6) * 0.02 * viewport.height
  })

  return (
    <>
      <Environnement />
      <ambientLight intensity={palette.ambiance} />
      <directionalLight position={[-4, 6, 8]} intensity={1.6} color="#ffffff" />
      <directionalLight position={[6, -2, 5]} intensity={0.7} color={palette.accent} />
      <directionalLight position={[-2, -3, 9]} intensity={0.15} color={palette.chaud} />

      <group ref={inclinaisonGroupe} scale={échelle}>
        <group ref={basculeGroupe}>
          <Appareil3D appareil={affiché} palette={palette} />
        </group>
      </group>
    </>
  )
}

export default MarkScene
