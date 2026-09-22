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

    /// Écart minimal entre deux commandes voisines, en proportion de leur
    /// taille. Deux cibles qui se frôlent sont deux cibles qu'un doigt
    /// tremblant confond : mieux vaut des boutons un peu plus petits et
    /// franchement séparés.
    var controlSpacing: CGFloat = 1.35

    /// Placement automatique sur les arcs, ou libre.
    var layoutMode: LayoutMode = .arc

    /// Réglages propres à chaque commande, par clé stable.
    var controlPreferences: [String: ControlPreference] = [:]

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

    // MARK: - Lecture tolérante

    /// Décodage qui survit à l'ajout d'un réglage.
    ///
    /// Le décodeur synthétisé par Swift n'utilise pas les valeurs par défaut :
    /// un profil enregistré avant l'arrivée d'un nouveau réglage échouerait à
    /// se relire, et la personne retrouverait des réglages d'usine sans
    /// comprendre pourquoi. Chaque champ est donc lu « s'il est présent ».
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        func value<T: Decodable>(_ key: CodingKeys, _ fallback: T) -> T {
            (try? container.decodeIfPresent(T.self, forKey: key)) .flatMap { $0 } ?? fallback
        }
        let defaults = HemiplegiaProfile()

        dominantHand = value(.dominantHand, defaults.dominantHand)
        thumbPivot = value(.thumbPivot, defaults.thumbPivot)
        innerReach = value(.innerReach, defaults.innerReach)
        outerReach = value(.outerReach, defaults.outerReach)
        reachSpan = value(.reachSpan, defaults.reachSpan)
        targetScale = value(.targetScale, defaults.targetScale)
        controlSpacing = value(.controlSpacing, defaults.controlSpacing)
        layoutMode = value(.layoutMode, defaults.layoutMode)
        controlPreferences = value(.controlPreferences, defaults.controlPreferences)
        activationMode = value(.activationMode, defaults.activationMode)
        dwellDuration = value(.dwellDuration, defaults.dwellDuration)
        debounceInterval = value(.debounceInterval, defaults.debounceInterval)
        tremorDamping = value(.tremorDamping, defaults.tremorDamping)
        stickDeadzone = value(.stickDeadzone, defaults.stickDeadzone)
        stickAutoCenter = value(.stickAutoCenter, defaults.stickAutoCenter)
        tiltReplacesSecondStick = value(.tiltReplacesSecondStick, defaults.tiltReplacesSecondStick)
        tiltSensitivity = value(.tiltSensitivity, defaults.tiltSensitivity)
        stickyModifiers = value(.stickyModifiers, defaults.stickyModifiers)
        stickyTimeout = value(.stickyTimeout, defaults.stickyTimeout)
        autoRepeat = value(.autoRepeat, defaults.autoRepeat)
        autoRepeatDelay = value(.autoRepeatDelay, defaults.autoRepeatDelay)
        autoRepeatInterval = value(.autoRepeatInterval, defaults.autoRepeatInterval)
        hapticsEnabled = value(.hapticsEnabled, defaults.hapticsEnabled)
        reducedMotion = value(.reducedMotion, defaults.reducedMotion)
    }

    /// L'initialisateur par membres, que la présence d'un `init(from:)`
    /// personnalisé n'enlève pas, mais que les préréglages utilisent
    /// explicitement.
    init(
        dominantHand: DominantHand = .right,
        thumbPivot: CGPoint = CGPoint(x: 0.90, y: 0.90),
        innerReach: CGFloat = 0.14,
        outerReach: CGFloat = 0.78,
        reachSpan: CGFloat = .pi / 2.4,
        targetScale: CGFloat = 1.25,
        controlSpacing: CGFloat = 1.35,
        layoutMode: LayoutMode = .arc,
        controlPreferences: [String: ControlPreference] = [:],
        activationMode: ActivationMode = .direct,
        dwellDuration: TimeInterval = 0.45,
        debounceInterval: TimeInterval = 0.12,
        tremorDamping: Double = 0.45,
        stickDeadzone: Double = 0.14,
        stickAutoCenter: Bool = true,
        tiltReplacesSecondStick: Bool = true,
        tiltSensitivity: Double = 1.4,
        stickyModifiers: Bool = true,
        stickyTimeout: TimeInterval = 6,
        autoRepeat: Bool = true,
        autoRepeatDelay: TimeInterval = 0.4,
        autoRepeatInterval: TimeInterval = 0.09,
        hapticsEnabled: Bool = true,
        reducedMotion: Bool = false
    ) {
        self.dominantHand = dominantHand
        self.thumbPivot = thumbPivot
        self.innerReach = innerReach
        self.outerReach = outerReach
        self.reachSpan = reachSpan
        self.targetScale = targetScale
        self.controlSpacing = controlSpacing
        self.layoutMode = layoutMode
        self.controlPreferences = controlPreferences
        self.activationMode = activationMode
        self.dwellDuration = dwellDuration
        self.debounceInterval = debounceInterval
        self.tremorDamping = tremorDamping
        self.stickDeadzone = stickDeadzone
        self.stickAutoCenter = stickAutoCenter
        self.tiltReplacesSecondStick = tiltReplacesSecondStick
        self.tiltSensitivity = tiltSensitivity
        self.stickyModifiers = stickyModifiers
        self.stickyTimeout = stickyTimeout
        self.autoRepeat = autoRepeat
        self.autoRepeatDelay = autoRepeatDelay
        self.autoRepeatInterval = autoRepeatInterval
        self.hapticsEnabled = hapticsEnabled
        self.reducedMotion = reducedMotion
    }

    static let `default` = HemiplegiaProfile()

    /// Préréglage « fatigue forte » : tout verrouille, rien ne se maintient.
    static let lowEffort = HemiplegiaProfile(
        thumbPivot: CGPoint(x: 0.90, y: 0.88),
        innerReach: 0.14,
        outerReach: 0.70,
        targetScale: 1.5,
        controlSpacing: 1.45,
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
        controlSpacing: 1.4,
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

    // MARK: - Réglages par commande

    func preference(_ key: String) -> ControlPreference {
        controlPreferences[key] ?? .default
    }

    func preference(_ control: ControlID) -> ControlPreference {
        preference(ControlKey.key(for: control))
    }

    /// Mode d'appui d'une commande : le sien s'il existe, sinon le général.
    /// Le nom diffère volontairement de la propriété `activationMode` : deux
    /// symboles identiques rendraient la lecture du code ambiguë.
    func activation(for key: String) -> ActivationMode {
        preference(key).activation ?? activationMode
    }

    func activation(for control: ControlID) -> ActivationMode {
        activation(for: ControlKey.key(for: control))
    }

    func isVisible(_ key: String) -> Bool {
        preference(key).isVisible
    }

    /// Écrit une préférence, et retire l'entrée quand elle redevient neutre :
    /// les réglages enregistrés ne gardent que ce qui a été choisi.
    mutating func setPreference(_ preference: ControlPreference, for key: String) {
        if preference.isDefault {
            controlPreferences.removeValue(forKey: key)
        } else {
            controlPreferences[key] = preference
        }
    }

    mutating func updatePreference(for key: String, _ change: (inout ControlPreference) -> Void) {
        var preference = preference(key)
        change(&preference)
        setPreference(preference, for: key)
    }

    /// Oublie toutes les positions libres, sans toucher aux autres réglages.
    mutating func clearFreePositions() {
        // Copie des clés : on modifie le dictionnaire pendant le parcours.
        for key in Array(controlPreferences.keys) {
            updatePreference(for: key) { $0.freePosition = nil }
        }
    }

    /// Remet chaque commande dans son état d'origine.
    mutating func resetControlPreferences() {
        controlPreferences.removeAll()
    }

    /// Clés des commandes masquées, pour les réafficher depuis les réglages.
    var hiddenKeys: [String] {
        controlPreferences.filter { !$0.value.isVisible }.keys.sorted()
    }
}
