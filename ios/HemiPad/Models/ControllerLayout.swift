import CoreGraphics
import Foundation

/// Plan de la manette : quelle commande, sur quel arc, à quelle taille.
///
/// La disposition vit ici plutôt que dans la vue pour une raison précise :
/// « aucune commande hors de l'écran, aucune commande sur une autre » est une
/// règle d'accessibilité, pas un détail visuel. Une cible partiellement cachée
/// ou collée à sa voisine, pour une main qui tremble, revient à une cible
/// inutilisable. La règle est donc calculée ici et vérifiée par des tests.
///
/// Le solveur travaille en trois temps :
/// 1. il déduit le rayon minimal de chaque arc de la taille des commandes,
///    en imposant un espacement entre voisines ;
/// 2. il place l'ensemble, puis translate le bloc entier si une commande
///    dépasse du cadre — les distances relatives, donc le geste appris, sont
///    conservées ;
/// 3. si le bloc reste trop grand pour l'écran, il réduit la taille des cibles
///    et recommence, sans jamais descendre sous les 44 points d'Apple.
struct ControllerLayout {
    enum Element: Equatable {
        /// Commande directionnelle principale : stick ou croix, au choix.
        case directional
        /// Bouton rond.
        case button(ControlID)
        /// Bouton système en gélule.
        case pill(ControlID)

        var control: ControlID? {
            switch self {
            case .directional: return nil
            case .button(let control), .pill(let control): return control
            }
        }
    }

    struct Placement: Equatable, Identifiable {
        let element: Element
        let center: CGPoint
        let size: CGSize

        var id: String {
            switch element {
            case .directional: return "directional"
            case .button(let control): return "button.\(control.rawValue)"
            case .pill(let control): return "pill.\(control.rawValue)"
            }
        }

        /// Rayon du cercle englobant : c'est cette distance qui sert au calcul
        /// de non-chevauchement, y compris pour les gélules.
        var halfExtent: CGFloat {
            abs(size.width - size.height) < 0.5
                ? size.width / 2
                : sqrt(size.width * size.width + size.height * size.height) / 2
        }

        var frame: CGRect {
            CGRect(
                x: center.x - size.width / 2,
                y: center.y - size.height / 2,
                width: size.width,
                height: size.height
            )
        }
    }

    struct Solution: Equatable {
        let placements: [Placement]
        let envelope: ReachEnvelope
        /// Taille de cible réellement retenue, éventuellement réduite pour tenir.
        let targetSize: CGFloat
        /// Rayons retenus, du plus proche au plus lointain (tracé du guide).
        let radii: [CGFloat]
        /// Vrai si la taille demandée par la personne a dû être réduite.
        var wasDownscaled: Bool
    }

    // Marges de sécurité, en points.
    static let sideMargin: CGFloat = 8
    /// Bande haute réservée au bandeau d'état et aux sélecteurs.
    static let topBand: CGFloat = 118
    /// Espacement minimal entre deux cibles voisines, en proportion de leur
    /// taille. 1,18 laisse un vide franc : deux cercles qui se frôlent sont
    /// deux cibles qu'un doigt tremblant confond.
    static let spacingFactor: CGFloat = 1.18
    /// Plancher d'Apple pour une cible tactile.
    static let minimumTargetSize: CGFloat = 44

    static let faceOrder: [ControlID] = [.faceWest, .faceNorth, .faceSouth, .faceEast]
    static let shoulderOrder: [ControlID] = [.shoulderLeft, .triggerLeft, .triggerRight, .shoulderRight]
    static let systemOrder: [ControlID] = [.select, .home, .capture, .start]
    static let pillSize = CGSize(width: 78, height: 38)

    /// Résout la disposition pour une taille de vue donnée.
    static func solve(profile: HemiplegiaProfile, console: ConsoleProfile, size: CGSize) -> Solution {
        let requested = profile.baseTargetSize
        var target = requested
        let baseEnvelope = ReachEnvelope(profile: profile, size: size)

        while true {
            if let solution = attempt(
                target: target,
                requested: requested,
                profile: profile,
                console: console,
                size: size,
                envelope: baseEnvelope
            ) {
                return solution
            }
            let next = target - max(2, target * 0.04)
            guard next >= minimumTargetSize else {
                // Écran trop petit même pour des cibles au minimum réglementaire :
                // on rend quand même une disposition, la vue défilera.
                return attempt(
                    target: minimumTargetSize,
                    requested: requested,
                    profile: profile,
                    console: console,
                    size: size,
                    envelope: baseEnvelope,
                    forced: true
                ) ?? Solution(
                    placements: [],
                    envelope: baseEnvelope,
                    targetSize: minimumTargetSize,
                    radii: [],
                    wasDownscaled: true
                )
            }
            target = next
        }
    }

    private struct Ring {
        let elements: [Element]
        let size: CGSize
    }

    private static func rings(target: CGFloat, console: ConsoleProfile) -> [Ring] {
        [
            Ring(
                elements: faceOrder.filter(console.has).map(Element.button),
                size: CGSize(width: target, height: target)
            ),
            Ring(
                elements: shoulderOrder.filter(console.has).map(Element.button),
                size: CGSize(width: target * 0.82, height: target * 0.82)
            ),
            Ring(
                elements: systemOrder.filter(console.has).map(Element.pill),
                size: pillSize
            )
        ].filter { !$0.elements.isEmpty }
    }

    private static func halfExtent(of size: CGSize) -> CGFloat {
        abs(size.width - size.height) < 0.5
            ? size.width / 2
            : sqrt(size.width * size.width + size.height * size.height) / 2
    }

    private static func attempt(
        target: CGFloat,
        requested: CGFloat,
        profile: HemiplegiaProfile,
        console: ConsoleProfile,
        size: CGSize,
        envelope: ReachEnvelope,
        forced: Bool = false
    ) -> Solution? {
        let rings = rings(target: target, console: console)
        guard !rings.isEmpty else { return nil }

        // 1. Rayon minimal de chaque arc.
        var radii: [CGFloat] = []
        var previous: (radius: CGFloat, halfExtent: CGFloat)?
        for ring in rings {
            let half = halfExtent(of: ring.size)
            var radius: CGFloat = 0
            if ring.elements.count > 1 {
                // Corde entre deux voisines : 2·r·sin(Δθ/2) ≥ écartement requis.
                let step = envelope.angularStep(count: ring.elements.count)
                radius = (2 * half * spacingFactor) / (2 * sin(step / 2))
            }
            if let previous {
                radius = max(radius, previous.radius + (previous.halfExtent + half) * spacingFactor)
            }
            radii.append(radius)
            previous = (radius, half)
        }

        // 2. Commande directionnelle, au plus près du pouce et sous le premier arc.
        let directionalSize = target * 1.6
        let firstRadius = radii[0]
        let firstHalf = halfExtent(of: rings[0].size)
        let maximumDirectional = firstRadius - (directionalSize / 2 + firstHalf) * spacingFactor
        guard maximumDirectional > 0 || forced else { return nil }
        let preferred = max(envelope.innerRadius, directionalSize * 0.35)
        let directionalRadius = max(min(preferred, maximumDirectional), directionalSize * 0.25)

        // 3. Placement brut.
        var placements: [Placement] = [
            Placement(
                element: .directional,
                center: envelope.position(radius: directionalRadius, index: 1, count: 4),
                size: CGSize(width: directionalSize, height: directionalSize)
            )
        ]
        for (ringIndex, ring) in rings.enumerated() {
            for (index, element) in ring.elements.enumerated() {
                placements.append(
                    Placement(
                        element: element,
                        center: envelope.position(
                            radius: radii[ringIndex],
                            index: index,
                            count: ring.elements.count
                        ),
                        size: ring.size
                    )
                )
            }
        }

        // 4. Le bloc tient-il dans le cadre ? Sinon, on réduira les cibles.
        let frames = placements.map(\.frame)
        let minX = frames.map(\.minX).min() ?? 0
        let maxX = frames.map(\.maxX).max() ?? 0
        let minY = frames.map(\.minY).min() ?? 0
        let maxY = frames.map(\.maxY).max() ?? 0

        let availableWidth = size.width - 2 * sideMargin
        let availableHeight = size.height - topBand - sideMargin
        guard forced || (maxX - minX <= availableWidth && maxY - minY <= availableHeight) else {
            return nil
        }

        // 5. Translation rigide minimale pour rentrer dans le cadre.
        var delta = CGSize.zero
        if minX < sideMargin {
            delta.width = sideMargin - minX
        } else if maxX > size.width - sideMargin {
            delta.width = size.width - sideMargin - maxX
        }
        if minY < topBand {
            delta.height = topBand - minY
        } else if maxY > size.height - sideMargin {
            delta.height = size.height - sideMargin - maxY
        }

        if delta != .zero {
            placements = placements.map {
                Placement(
                    element: $0.element,
                    center: CGPoint(x: $0.center.x + delta.width, y: $0.center.y + delta.height),
                    size: $0.size
                )
            }
        }

        return Solution(
            placements: placements,
            envelope: envelope.offset(by: delta),
            targetSize: target,
            radii: [directionalRadius] + radii,
            wasDownscaled: target < requested - 0.5
        )
    }
}
