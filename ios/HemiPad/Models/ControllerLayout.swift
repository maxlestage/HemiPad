import CoreGraphics
import Foundation

/// Plan de la manette : quelle commande, où, à quelle taille.
///
/// Deux modes coexistent.
///
/// **Automatique** — les commandes se posent sur des arcs centrés sur
/// l'articulation du pouce. Le solveur déduit les rayons de la taille des
/// cibles, translate le bloc entier s'il déborde, puis, s'il le faut, réduit
/// les cibles et enfin l'espacement. Réduire plutôt que masquer est une règle :
/// une commande absente oblige à changer d'écran en plein jeu.
///
/// **Libre** — la personne place elle-même chaque commande. Le mode
/// automatique sert de point de départ, et rien n'est imposé : les
/// chevauchements sont autorisés, simplement signalés.
///
/// Dans les deux cas, chaque commande peut être masquée, agrandie, et avoir son
/// propre mode d'appui.
struct ControllerLayout {
    enum Element: Equatable {
        /// Le stick analogique.
        case directional
        /// La croix directionnelle. Toutes les manettes en ont une, à côté du
        /// stick : l'une sert à se déplacer, l'autre à naviguer dans les menus.
        case dpad
        /// Le second stick analogique, pour la caméra. Masqué par défaut :
        /// l'arc de vision fait le même travail avec des boutons ; le stick
        /// est là « en cas où », pour les mouvements fins.
        case cameraStick
        /// Bouton rond.
        case button(ControlID)
        /// Bouton système en gélule.
        case pill(ControlID)

        var control: ControlID? {
            switch self {
            case .directional, .dpad, .cameraStick: return nil
            case .button(let control), .pill(let control): return control
            }
        }

        /// Clé de préférences, stable et écrite sur le disque.
        var key: String {
            switch self {
            case .directional: return ControlKey.directional
            case .dpad: return ControlKey.dpad
            case .cameraStick: return ControlKey.cameraStick
            case .button(let control), .pill(let control): return ControlKey.key(for: control)
            }
        }
    }

    struct Placement: Equatable, Identifiable {
        let element: Element
        let center: CGPoint
        let size: CGSize

        var id: String { element.key }

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
        /// Espacement réellement appliqué, éventuellement réduit pour tenir.
        let spacing: CGFloat
        /// Rayons retenus, du plus proche au plus lointain (tracé du guide).
        let radii: [CGFloat]
        /// Vrai si la taille demandée par la personne a dû être réduite.
        let wasDownscaled: Bool
        /// Vrai si l'espacement demandé a dû être resserré.
        let wasTightened: Bool
        /// Mode ayant produit ce plan.
        let mode: LayoutMode

        func placement(for key: String) -> Placement? {
            placements.first { $0.id == key }
        }

        /// Paires de commandes qui se chevauchent. Toujours vide en mode
        /// automatique ; en mode libre, c'est un avertissement, pas un blocage.
        var overlapping: Set<String> {
            var result: Set<String> = []
            for i in placements.indices {
                for j in placements.indices where j > i {
                    let a = placements[i]
                    let b = placements[j]
                    let distance = hypot(a.center.x - b.center.x, a.center.y - b.center.y)
                    if distance < a.halfExtent + b.halfExtent - 0.5 {
                        result.insert(a.id)
                        result.insert(b.id)
                    }
                }
            }
            return result
        }
    }

    // Marges de sécurité, en points.
    static let sideMargin: CGFloat = 8
    /// Bande haute réservée au bandeau d'état et aux sélecteurs.
    static let topBand: CGFloat = 118
    /// Espacement en deçà duquel on ne descend jamais, même à l'étroit.
    static let minimumSpacing: CGFloat = 1.06
    /// Plancher d'Apple pour une cible tactile.
    static let minimumTargetSize: CGFloat = 44

    static let faceOrder: [ControlID] = [.faceWest, .faceNorth, .faceSouth, .faceEast]
    /// L'arc de vision, juste après les boutons de façade : la caméra sert
    /// presque autant qu'eux dans un jeu en trois dimensions.
    static let cameraOrder: [ControlID] = [.lookLeft, .lookUp, .lookDown, .lookRight]
    static let shoulderOrder: [ControlID] = [.shoulderLeft, .triggerLeft, .triggerRight, .shoulderRight]
    static let systemOrder: [ControlID] = [.select, .home, .capture, .start]
    static let pillSize = CGSize(width: 78, height: 38)

    /// Toutes les commandes qu'une console propose, masquées comprises : c'est
    /// la liste que l'écran de réglages parcourt.
    static func allElements(for console: ConsoleProfile) -> [Element] {
        var elements: [Element] = [.directional, .dpad]
        if console.hasCamera { elements.append(.cameraStick) }
        elements.append(contentsOf: faceOrder.filter(console.has).map(Element.button))
        elements.append(contentsOf: cameraOrder.filter(console.has).map(Element.button))
        elements.append(contentsOf: shoulderOrder.filter(console.has).map(Element.button))
        elements.append(contentsOf: systemOrder.filter(console.has).map(Element.pill))
        return elements
    }

    /// Résout la disposition pour une taille de vue donnée.
    static func solve(profile: HemiplegiaProfile, console: ConsoleProfile, size: CGSize) -> Solution {
        // Chaque console lit sa propre disposition si elle en a une.
        var profile = profile
        profile.activeConsole = console.target.rawValue
        let arc = solveArc(profile: profile, console: console, size: size)
        guard profile.layoutMode == .free else { return arc }
        return applyFreePositions(to: arc, profile: profile, size: size)
    }

    // MARK: - Mode automatique

    private static func solveArc(
        profile: HemiplegiaProfile,
        console: ConsoleProfile,
        size: CGSize
    ) -> Solution {
        // L'espacement demandé est ramené au centième : le solveur ne
        // parcourt que cette grille, et la parcourt entière. La cible, elle,
        // est d'abord essayée telle quelle, puis au point entier inférieur.
        let requestedTarget = profile.baseTargetSize
        let requestedSpacing = floor(max(profile.controlSpacing, minimumSpacing) * 100 + 1e-9) / 100
        let baseEnvelope = ReachEnvelope(profile: profile, size: size)

        func tryLayout(_ target: CGFloat, _ spacing: CGFloat, forced: Bool = false) -> Solution? {
            attempt(
                target: target,
                spacing: spacing,
                requestedTarget: requestedTarget,
                requestedSpacing: requestedSpacing,
                profile: profile,
                console: console,
                size: size,
                envelope: baseEnvelope,
                forced: forced
            )
        }

        if let direct = tryLayout(requestedTarget, requestedSpacing) { return direct }

        /*
         * La règle : les cibles gardent la taille demandée aussi longtemps
         * que possible. C'est l'espacement qui cède d'abord, jusqu'à son
         * plancher ; les cibles ne rétrécissent qu'ensuite.
         *
         * L'ordre était l'inverse, et 100 points demandés avec un écart ×2
         * donnaient sur iPhone des boutons de 44 points très écartés : le
         * contraire de ce dont une main qui vise mal a besoin. Un bouton
         * trop petit n'est plus une cible ; un écart un peu réduit reste
         * utilisable.
         *
         * La recherche parcourt une grille fixe — la demande puis chaque
         * point entier en dessous, le centième pour l'espacement — et garde
         * la première valeur qui tient. Le résultat ne dépend pas du chemin :
         * demander plus ne donne jamais moins (l'ancienne descente par pas
         * de 4 % donnait 63 points pour 68 demandés, quand 64 en donnaient
         * 64), et écarter davantage ne grossit jamais les cibles.
         */
        var target = requestedTarget
        while target >= minimumTargetSize {
            defer { target = ceil(target) - 1 }
            guard tryLayout(target, minimumSpacing) != nil else { continue }
            // Elle tient : on lui rend autant d'écart que possible.
            var hundredths = Int((requestedSpacing * 100).rounded())
            while CGFloat(hundredths) > minimumSpacing * 100 {
                if let solution = tryLayout(target, CGFloat(hundredths) / 100) { return solution }
                hundredths -= 1
            }
            if let solution = tryLayout(target, minimumSpacing) { return solution }
        }

        // Même au plancher, rien ne tient : on pose quand même tout, quitte à
        // ce que des commandes se chevauchent. Un bouton caché est pire
        // qu'un bouton serré.
        return tryLayout(minimumTargetSize, minimumSpacing, forced: true) ?? Solution(
            placements: [],
            envelope: baseEnvelope,
            targetSize: minimumTargetSize,
            spacing: minimumSpacing,
            radii: [],
            wasDownscaled: true,
            wasTightened: true,
            mode: profile.layoutMode
        )
    }

    private struct Ring {
        let elements: [Element]
        let sizes: [CGSize]

        var maximumHalfExtent: CGFloat {
            sizes.map(halfExtent(of:)).max() ?? 0
        }
    }

    /// Anneaux réellement affichés : les commandes masquées n'y figurent pas,
    /// et chaque commande porte sa propre taille.
    private static func rings(
        target: CGFloat,
        profile: HemiplegiaProfile,
        console: ConsoleProfile
    ) -> [Ring] {
        func build(_ controls: [ControlID], scale: CGFloat, makeElement: (ControlID) -> Element) -> Ring {
            let visible = controls.filter { console.has($0) && profile.isVisible(ControlKey.key(for: $0)) }
            let sizes = visible.map { control -> CGSize in
                let side = target * scale * profile.preference(control).sizeScale
                return CGSize(width: side, height: side)
            }
            return Ring(elements: visible.map(makeElement), sizes: sizes)
        }

        func buildPills(_ controls: [ControlID]) -> Ring {
            let visible = controls.filter { console.has($0) && profile.isVisible(ControlKey.key(for: $0)) }
            let sizes = visible.map { control -> CGSize in
                let scale = profile.preference(control).sizeScale
                return CGSize(width: pillSize.width * scale, height: pillSize.height * scale)
            }
            return Ring(elements: visible.map(Element.pill), sizes: sizes)
        }

        return [
            build(faceOrder, scale: 1, makeElement: Element.button),
            build(cameraOrder, scale: 0.82, makeElement: Element.button),
            build(shoulderOrder, scale: 0.82, makeElement: Element.button),
            buildPills(systemOrder)
        ].filter { !$0.elements.isEmpty }
    }

    private static func halfExtent(of size: CGSize) -> CGFloat {
        abs(size.width - size.height) < 0.5
            ? size.width / 2
            : sqrt(size.width * size.width + size.height * size.height) / 2
    }

    private static func attempt(
        target: CGFloat,
        spacing: CGFloat,
        requestedTarget: CGFloat,
        requestedSpacing: CGFloat,
        profile: HemiplegiaProfile,
        console: ConsoleProfile,
        size: CGSize,
        envelope: ReachEnvelope,
        forced: Bool = false
    ) -> Solution? {
        var rings = rings(target: target, profile: profile, console: console)

        // Le stick, la croix — et le stick caméra s'il est affiché —, les
        // commandes que le pouce utilise le plus, au plus près de lui.
        // Visibles à plusieurs, ils forment le premier arc ; s'il n'en reste
        // qu'un, il prend seul la place du stick, sous le premier arc.
        var innerCandidates: [Element] = [.directional, .dpad]
        if console.hasCamera { innerCandidates.append(.cameraStick) }
        let inner = innerCandidates.filter { profile.isVisible($0.key) }
        func innerSize(_ element: Element) -> CGSize {
            let side = target * 1.6 * profile.preference(element.key).sizeScale
            return CGSize(width: side, height: side)
        }
        if inner.count >= 2 {
            rings.insert(Ring(elements: inner, sizes: inner.map(innerSize)), at: 0)
        }
        let single = inner.count == 1 ? inner[0] : nil
        guard !rings.isEmpty || single != nil else { return nil }

        // 1. Rayon minimal de chaque arc.
        var radii: [CGFloat] = []
        var previous: (radius: CGFloat, halfExtent: CGFloat)?
        for ring in rings {
            let half = ring.maximumHalfExtent
            var radius: CGFloat = 0
            if ring.elements.count > 1 {
                // Corde entre deux voisines : 2·r·sin(Δθ/2) ≥ écartement requis.
                let step = envelope.angularStep(count: ring.elements.count)
                radius = (2 * half * spacing) / (2 * sin(step / 2))
            }
            if let previous {
                radius = max(radius, previous.radius + (previous.halfExtent + half) * spacing)
            }
            radii.append(radius)
            previous = (radius, half)
        }

        // 2. Commande directionnelle seule, au plus près du pouce et sous le
        //    premier arc.
        var placements: [Placement] = []
        var directionalRadius: CGFloat = 0
        if let single {
            let directionalSize = innerSize(single).width
            if let firstRadius = radii.first, let firstRing = rings.first {
                let maximum = firstRadius - (directionalSize / 2 + firstRing.maximumHalfExtent) * spacing
                guard maximum > 0 || forced else { return nil }
                let preferred = max(envelope.innerRadius, directionalSize * 0.35)
                directionalRadius = max(min(preferred, maximum), directionalSize * 0.25)
            } else {
                directionalRadius = max(envelope.innerRadius, directionalSize * 0.5)
            }
            placements.append(
                Placement(
                    element: single,
                    center: envelope.position(radius: directionalRadius, index: 1, count: 4),
                    size: CGSize(width: directionalSize, height: directionalSize)
                )
            )
        }

        // 3. Placement brut.
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
                        size: ring.sizes[index]
                    )
                )
            }
        }

        guard !placements.isEmpty else { return nil }

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
            spacing: spacing,
            radii: single != nil ? [directionalRadius] + radii : radii,
            wasDownscaled: target < requestedTarget - 0.5,
            wasTightened: spacing < requestedSpacing - 0.005,
            mode: profile.layoutMode
        )
    }

    // MARK: - Mode libre

    /// Remplace les positions calculées par celles choisies, et garde chaque
    /// commande entièrement visible : une cible à moitié hors de l'écran n'est
    /// plus une cible.
    private static func applyFreePositions(
        to arc: Solution,
        profile: HemiplegiaProfile,
        size: CGSize
    ) -> Solution {
        let placements = arc.placements.map { placement -> Placement in
            guard let stored = profile.preference(placement.id).freePosition else { return placement }
            let center = clamp(
                CGPoint(x: stored.x * size.width, y: stored.y * size.height),
                size: placement.size,
                in: size
            )
            return Placement(element: placement.element, center: center, size: placement.size)
        }

        return Solution(
            placements: placements,
            envelope: arc.envelope,
            targetSize: arc.targetSize,
            spacing: arc.spacing,
            radii: arc.radii,
            wasDownscaled: arc.wasDownscaled,
            wasTightened: arc.wasTightened,
            mode: .free
        )
    }

    /// Ramène un centre de commande dans le cadre, marges comprises.
    ///
    /// La bande haute est exclue même en mode libre : le bandeau d'état y est
    /// dessiné par-dessus, et une commande placée dessous ne recevrait aucun
    /// appui. Une liberté qui produit un bouton inutilisable n'en est pas une.
    static func clamp(
        _ center: CGPoint,
        size: CGSize,
        in bounds: CGSize,
        topInset: CGFloat = topBand
    ) -> CGPoint {
        let halfWidth = size.width / 2
        let halfHeight = size.height / 2
        let minX = sideMargin + halfWidth
        let maxX = max(minX, bounds.width - sideMargin - halfWidth)
        let minY = topInset + halfHeight
        let maxY = max(minY, bounds.height - sideMargin - halfHeight)
        return CGPoint(
            x: min(max(center.x, minX), maxX),
            y: min(max(center.y, minY), maxY)
        )
    }

    /// Position normalisée (0…1) à enregistrer pour une position à l'écran.
    static func normalized(_ center: CGPoint, in bounds: CGSize) -> CGPoint {
        guard bounds.width > 0, bounds.height > 0 else { return .zero }
        return CGPoint(x: center.x / bounds.width, y: center.y / bounds.height)
    }
}
