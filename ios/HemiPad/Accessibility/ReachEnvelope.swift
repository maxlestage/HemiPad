import CoreGraphics
import Foundation

/// Géométrie de l'enveloppe d'atteinte du pouce.
///
/// Toutes les commandes sont posées sur des arcs concentriques centrés sur le
/// point de pivot du pouce. Personne n'a besoin de traverser l'écran : c'est la
/// différence entre une manette utilisable à une main et une manette décorative.
///
/// L'enveloppe ne décide pas des rayons : elle fournit le repère (pivot, sens
/// de balayage, ouverture). Les rayons viennent de `ControllerLayout`, qui les
/// calcule à partir de la taille réelle des commandes.
struct ReachEnvelope: Equatable, Sendable {
    let pivot: CGPoint       // en points, dans le repère de la vue
    let innerRadius: CGFloat // rayon confortable minimal, issu du profil
    let outerRadius: CGFloat // rayon confortable maximal, issu du profil
    let span: CGFloat        // ouverture angulaire balayée, en radians
    let sweepSign: CGFloat   // -1 pour la main droite, +1 pour la gauche

    /// Construit l'enveloppe pour une taille de vue donnée.
    init(profile: HemiplegiaProfile, size: CGSize) {
        let reference = min(size.width, size.height * 0.8)
        let mirroredX = profile.dominantHand == .right
            ? profile.thumbPivot.x
            : 1 - profile.thumbPivot.x
        pivot = CGPoint(x: mirroredX * size.width, y: profile.thumbPivot.y * size.height)
        innerRadius = profile.innerReach * reference
        outerRadius = profile.outerReach * reference
        span = profile.reachSpan
        sweepSign = profile.dominantHand.sweepSign
    }

    private init(pivot: CGPoint, innerRadius: CGFloat, outerRadius: CGFloat, span: CGFloat, sweepSign: CGFloat) {
        self.pivot = pivot
        self.innerRadius = innerRadius
        self.outerRadius = outerRadius
        self.span = span
        self.sweepSign = sweepSign
    }

    /// Translation rigide de l'enveloppe.
    ///
    /// Sur un petit écran, le pivot idéal placerait une partie des commandes
    /// hors cadre : on déplace alors l'ensemble du bloc d'un seul tenant, ce
    /// qui conserve les distances relatives — donc le geste appris.
    func offset(by delta: CGSize) -> ReachEnvelope {
        ReachEnvelope(
            pivot: CGPoint(x: pivot.x + delta.width, y: pivot.y + delta.height),
            innerRadius: innerRadius,
            outerRadius: outerRadius,
            span: span,
            sweepSign: sweepSign
        )
    }

    /// Angle d'un élément réparti régulièrement sur l'arc.
    ///
    /// L'arc **part** de la verticale (pouce tendu au-dessus de son
    /// articulation) et balaie vers l'intérieur de l'écran. Il n'est pas centré
    /// sur la verticale : de l'autre côté, il n'y a que le bord du téléphone.
    func angle(index: Int, count: Int) -> CGFloat {
        guard count > 1 else { return -.pi / 2 }
        let t = CGFloat(index) / CGFloat(count - 1)
        return -.pi / 2 + sweepSign * t * span
    }

    /// Écart angulaire entre deux voisins d'un même arc.
    func angularStep(count: Int) -> CGFloat {
        guard count > 1 else { return 0 }
        return span / CGFloat(count - 1)
    }

    func point(radius: CGFloat, angle: CGFloat) -> CGPoint {
        CGPoint(x: pivot.x + cos(angle) * radius, y: pivot.y + sin(angle) * radius)
    }

    func position(radius: CGFloat, index: Int, count: Int) -> CGPoint {
        point(radius: radius, angle: angle(index: index, count: count))
    }

    /// Un point est-il dans la zone confortable ? Sert à signaler visuellement
    /// une commande déplacée hors de portée après une calibration.
    func contains(_ point: CGPoint) -> Bool {
        let dx = point.x - pivot.x
        let dy = point.y - pivot.y
        let distance = sqrt(dx * dx + dy * dy)
        guard distance >= innerRadius * 0.6, distance <= outerRadius * 1.15 else { return false }
        let angle = atan2(dy, dx)
        let delta = Self.normalize(angle - (-.pi / 2)) * sweepSign
        return delta >= -span * 0.1 && delta <= span * 1.1
    }

    /// Ramène un angle dans [-π, π].
    static func normalize(_ angle: CGFloat) -> CGFloat {
        var a = angle
        while a > .pi { a -= 2 * .pi }
        while a < -.pi { a += 2 * .pi }
        return a
    }
}
