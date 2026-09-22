import Foundation

/// Identifiant abstrait d'un contrôle, indépendant de la console ciblée.
///
/// Le reste de l'application ne parle jamais « croix », « A » ou « B » : elle
/// parle de `faceSouth`, `faceEast`… Le `ConsoleProfile` se charge ensuite de
/// donner le bon glyphe et le bon index HID pour la machine branchée.
enum ControlID: String, Codable, CaseIterable, Identifiable, Sendable {
    // Boutons de face (position géométrique, pas nom de constructeur)
    case faceSouth
    case faceEast
    case faceWest
    case faceNorth

    // Croix directionnelle
    case dpadUp
    case dpadDown
    case dpadLeft
    case dpadRight

    // Tranches
    case shoulderLeft
    case shoulderRight
    case triggerLeft
    case triggerRight

    // Clics de sticks
    case stickLeftPress
    case stickRightPress

    // Boutons système
    case start
    case select
    case home
    case capture

    var id: String { rawValue }

    /// Index de bouton HID (1…16) utilisé par le descripteur de rapport.
    /// `nil` pour les contrôles transmis autrement (hat switch, axes).
    var hidButtonIndex: Int? {
        switch self {
        case .faceSouth: return 1
        case .faceEast: return 2
        case .faceWest: return 3
        case .faceNorth: return 4
        case .shoulderLeft: return 5
        case .shoulderRight: return 6
        case .triggerLeft: return 7
        case .triggerRight: return 8
        case .select: return 9
        case .start: return 10
        case .stickLeftPress: return 11
        case .stickRightPress: return 12
        case .home: return 13
        case .capture: return 14
        case .dpadUp, .dpadDown, .dpadLeft, .dpadRight: return nil
        }
    }

    /// Les gâchettes sont analogiques : elles alimentent aussi un axe 0…255.
    var isAnalogTrigger: Bool {
        self == .triggerLeft || self == .triggerRight
    }

    var isDirectionalPad: Bool {
        switch self {
        case .dpadUp, .dpadDown, .dpadLeft, .dpadRight: return true
        default: return false
        }
    }

    /// Libellé lu par VoiceOver quand aucun profil n'est chargé.
    var fallbackLabel: String {
        switch self {
        case .faceSouth: return "Bouton bas"
        case .faceEast: return "Bouton droite"
        case .faceWest: return "Bouton gauche"
        case .faceNorth: return "Bouton haut"
        case .dpadUp: return "Croix haut"
        case .dpadDown: return "Croix bas"
        case .dpadLeft: return "Croix gauche"
        case .dpadRight: return "Croix droite"
        case .shoulderLeft: return "Tranche gauche"
        case .shoulderRight: return "Tranche droite"
        case .triggerLeft: return "Gâchette gauche"
        case .triggerRight: return "Gâchette droite"
        case .stickLeftPress: return "Clic stick gauche"
        case .stickRightPress: return "Clic stick droit"
        case .start: return "Start"
        case .select: return "Select"
        case .home: return "Accueil"
        case .capture: return "Capture"
        }
    }
}

/// Les deux sticks analogiques, traités à part des boutons.
enum StickID: String, Codable, CaseIterable, Identifiable, Sendable {
    case left
    case right

    var id: String { rawValue }

    var label: String {
        self == .left ? "Stick gauche" : "Stick droit"
    }
}
