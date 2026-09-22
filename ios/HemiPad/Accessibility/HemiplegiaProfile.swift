import CoreGraphics
import Foundation

/// Main valide de la personne. Toute la géométrie de l'app en découle.
enum DominantHand: String, Codable, CaseIterable, Identifiable, Sendable {
    case left
    case right

    var id: String { rawValue }

    var label: String { self == .left ? "Main gauche" : "Main droite" }

    /// Sens de l'arc de préhension : le pouce balaie vers l'intérieur de l'écran.
    var sweepSign: CGFloat { self == .right ? -1 : 1 }
}

/// Stratégie d'appui, choisie selon la fatigue et la spasticité.
enum ActivationMode: String, Codable, CaseIterable, Identifiable, Sendable {
    /// Appui classique : on touche, ça s'active, on relâche, ça se relâche.
    case direct
    /// Appui verrouillant : un appui active, un second désactive. Aucun maintien.
    case latch
    /// Survol prolongé : poser le doigt et attendre `dwellDuration` valide.
    case dwell

    var id: String { rawValue }

    var label: String {
        switch self {
        case .direct: return "Appui direct"
        case .latch: return "Appui verrouillant"
        case .dwell: return "Survol prolongé"
        }
    }

    var explanation: String {
        switch self {
        case .direct: return "Le contrôle suit le doigt, comme une manette classique."
        case .latch: return "Un appui active, un appui désactive. Rien à maintenir."
        case .dwell: return "Posez le doigt et attendez : l'appui se déclenche seul."
        }
    }
}

/// Réglages d'accessibilité — le cœur de HemiPad.
///
/// L'hypothèse de travail est simple : **une seule main est disponible, et elle
/// se fatigue**. Chaque réglage ici existe pour supprimer un geste impossible
/// (maintenir deux boutons, bouger deux sticks) ou coûteux (traverser l'écran).
struct HemiplegiaProfile: Codable, Equatable, Sendable {
    /// Main qui tient et pilote l'appareil.
    var dominantHand: DominantHand = .right

    /// Centre de rotation du pouce, en coordonnées normalisées (0…1) de l'écran.
    /// Calibré en traçant un arc dans l'écran de réglage.
    var thumbPivot: CGPoint = CGPoint(x: 0.90, y: 0.90)

    /// Rayons d'atteinte confortables, en fraction de la largeur d'écran.
    /// Ces valeurs par défaut sont celles pour lesquelles aucune commande ne
    /// sort de l'écran ni n'en chevauche une autre sur un iPhone standard.
    var innerReach: CGFloat = 0.14
    var outerReach: CGFloat = 0.78

    /// Demi-ouverture de l'arc balayé par le pouce, en radians.
    var reachSpan: CGFloat = .pi / 2.4

    /// Grossissement des cibles tactiles (1 = taille de base ≈ 56 pt).
    var targetScale: CGFloat = 1.25

    /// Mode d'appui par défaut pour les boutons de face.
    var activationMode: ActivationMode = .direct

    /// Durée de survol avant validation, en secondes (mode `dwell`).
    var dwellDuration: TimeInterval = 0.45

    /// Ignore les ré-appuis plus rapides que cette durée (anti-rebond spastique).
    var debounceInterval: TimeInterval = 0.12

    /// Intensité du filtre anti-tremblement appliqué aux sticks (0 = désactivé).
    var tremorDamping: Double = 0.45

    /// Zone morte au centre des sticks, en fraction du rayon.
    var stickDeadzone: Double = 0.14

    /// Le stick revient-il automatiquement au centre quand on lâche ?
    /// Désactivé, il « garde la position » : utile pour avancer sans maintenir.
    var stickAutoCenter: Bool = true

    /// Remplace le second stick par l'inclinaison de l'appareil (gyroscope).
    var tiltReplacesSecondStick: Bool = true

    /// Sensibilité de la visée à l'inclinaison.
    var tiltSensitivity: Double = 1.4

    /// Les modificateurs (L1, ⇧, ⌘…) restent actifs jusqu'à la frappe suivante.
    var stickyModifiers: Bool = true

    /// Durée de vie d'un modificateur collant sans frappe, en secondes.
    var stickyTimeout: TimeInterval = 6

    /// Répétition automatique quand un bouton est maintenu.
    var autoRepeat: Bool = true
    var autoRepeatDelay: TimeInterval = 0.4
    var autoRepeatInterval: TimeInterval = 0.09

    /// Retour haptique à chaque appui validé (remplace le retour visuel raté
    /// quand le pouce masque le bouton).
    var hapticsEnabled: Bool = true

    /// Réduit les animations de fond, coûteuses en attention.
    var reducedMotion: Bool = false

    static let `default` = HemiplegiaProfile()

    /// Préréglage « fatigue forte » : tout verrouille, rien ne se maintient.
    static let lowEffort = HemiplegiaProfile(
        thumbPivot: CGPoint(x: 0.90, y: 0.88),
        innerReach: 0.14,
        outerReach: 0.70,
        targetScale: 1.5,
        activationMode: .latch,
        dwellDuration: 0.6,
        debounceInterval: 0.2,
        tremorDamping: 0.7,
        stickDeadzone: 0.2,
        stickAutoCenter: false,
        tiltReplacesSecondStick: true,
        tiltSensitivity: 1.0,
        stickyModifiers: true,
        stickyTimeout: 10,
        autoRepeat: true,
        hapticsEnabled: true,
        reducedMotion: true
    )

    /// Préréglage « spasticité » : anti-rebond long, filtrage fort, survol.
    static let tremorControl = HemiplegiaProfile(
        targetScale: 1.4,
        activationMode: .dwell,
        dwellDuration: 0.35,
        debounceInterval: 0.25,
        tremorDamping: 0.85,
        stickDeadzone: 0.24,
        stickAutoCenter: true,
        tiltReplacesSecondStick: false,
        stickyModifiers: true,
        autoRepeat: false,
        hapticsEnabled: true,
        reducedMotion: true
    )

    /// Taille de cible en points, dérivée de l'échelle. Jamais sous 44 pt,
    /// minimum recommandé par les règles d'accessibilité d'Apple.
    var baseTargetSize: CGFloat {
        max(44, 56 * targetScale)
    }
}
